using System.ComponentModel.Composition;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Mendix.StudioPro.ExtensionsAPI.UI.WebServer;

namespace Stoneworx.DevToolbox;

/// <summary>Serves the toolbox web UI, which is embedded in this assembly, from Studio Pro's local web server.</summary>
[Export(typeof(WebServerExtension))]
public sealed class DevToolboxWebServer : WebServerExtension
{
    public const string Route = "dev-toolbox";

    public static Uri IndexUri(Uri baseUrl) => new(baseUrl, $"{Route}/index.html");

    public override void InitializeWebServer(IWebServer webServer) => webServer.AddRoute(Route, RequestHandler.HandleAsync);
}

/// <summary>Request handling kept apart from the extension class so it can run outside Studio Pro in tests.</summary>
public static class RequestHandler
{
    private const int MaxBodyBytes = 10 * 1024 * 1024;
    private static readonly Assembly Assembly = typeof(RequestHandler).Assembly;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task HandleAsync(HttpListenerRequest request, HttpListenerResponse response, CancellationToken cancellationToken)
    {
        try
        {
            var file = RelativePath(request.Url?.AbsolutePath ?? "");
            if (file == "api/validate-xsd" && request.HttpMethod == "POST")
                await ValidateXsdAsync(request, response, cancellationToken);
            else if (request.HttpMethod == "GET")
                await ServeFileAsync(file, response, cancellationToken);
            else
                response.StatusCode = (int)HttpStatusCode.MethodNotAllowed;
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            response.StatusCode = (int)HttpStatusCode.InternalServerError;
        }
        finally
        {
            response.Close();
        }
    }

    public static string RelativePath(string absolutePath)
    {
        var marker = $"/{DevToolboxWebServer.Route}/";
        var start = absolutePath.IndexOf(marker, StringComparison.Ordinal);
        var file = start < 0 ? "" : Uri.UnescapeDataString(absolutePath[(start + marker.Length)..]);
        return file.Length == 0 ? "index.html" : file;
    }

    private static async Task ServeFileAsync(string file, HttpListenerResponse response, CancellationToken cancellationToken)
    {
        // Resource names are fixed at build time, so a path like ../ simply finds nothing.
        await using var stream = Assembly.GetManifestResourceStream($"wwwroot/{file}");
        if (stream is null)
        {
            response.StatusCode = (int)HttpStatusCode.NotFound;
            return;
        }

        response.StatusCode = (int)HttpStatusCode.OK;
        response.ContentType = ContentType(file);
        response.ContentLength64 = stream.Length;
        response.AddHeader("Cache-Control", "no-cache");
        await stream.CopyToAsync(response.OutputStream, cancellationToken);
    }

    private static async Task ValidateXsdAsync(HttpListenerRequest request, HttpListenerResponse response, CancellationToken cancellationToken)
    {
        if (request.ContentLength64 > MaxBodyBytes)
        {
            response.StatusCode = (int)HttpStatusCode.RequestEntityTooLarge;
            return;
        }

        var body = await JsonSerializer.DeserializeAsync<XsdRequest>(request.InputStream, Json, cancellationToken);
        if (body?.Xml is null || body.Xsd is null)
        {
            response.StatusCode = (int)HttpStatusCode.BadRequest;
            return;
        }

        var result = XsdValidator.Validate(body.Xml, body.Xsd);
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(result, Json));
        response.StatusCode = (int)HttpStatusCode.OK;
        response.ContentType = "application/json; charset=utf-8";
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes, cancellationToken);
    }

    private sealed record XsdRequest(string? Xml, string? Xsd);

    private static string ContentType(string file) => Path.GetExtension(file).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".json" => "application/json",
        ".txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };
}
