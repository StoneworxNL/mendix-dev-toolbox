using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using Stoneworx.DevToolbox;
using Xunit;

public sealed class RequestHandlerTests : IDisposable
{
    private readonly HttpListener listener = new();
    private readonly HttpClient client;

    public RequestHandlerTests()
    {
        var port = FreePort();
        listener.Prefixes.Add($"http://localhost:{port}/");
        listener.Start();
        _ = Task.Run(async () =>
        {
            while (listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await listener.GetContextAsync(); } catch { return; }
                _ = RequestHandler.HandleAsync(ctx.Request, ctx.Response, CancellationToken.None);
            }
        });
        client = new HttpClient { BaseAddress = new Uri($"http://localhost:{port}/dev-toolbox/") };
    }

    private static int FreePort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }

    [Theory]
    [InlineData("/dev-toolbox/", "index.html")]
    [InlineData("/dev-toolbox/js/app.js", "js/app.js")]
    [InlineData("/dev-toolbox/a%20b.css", "a b.css")]
    public void MapsUrlsToResources(string path, string expected) => Assert.Equal(expected, RequestHandler.RelativePath(path));

    [Fact]
    public async Task ServesEmbeddedFiles()
    {
        var index = await client.GetAsync("index.html");
        Assert.Equal(HttpStatusCode.OK, index.StatusCode);
        Assert.Equal("text/html", index.Content.Headers.ContentType?.MediaType);
        Assert.Contains("js/app.js", await index.Content.ReadAsStringAsync());

        var script = await client.GetAsync("js/tools/encoders.js");
        Assert.Equal("text/javascript", script.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task ReturnsNotFoundOutsideTheBundle()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("nope.js")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("..%2F..%2Fmanifest.json")).StatusCode);
    }

    [Fact]
    public async Task ValidatesXsdOverHttp()
    {
        var res = await client.PostAsJsonAsync("api/validate-xsd", new { xml = "<a>1</a>", xsd = "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"><xs:element name=\"a\" type=\"xs:int\"/></xs:schema>" });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<XsdValidationResult>();
        Assert.True(body!.Valid);
    }

    public void Dispose()
    {
        client.Dispose();
        listener.Close();
    }
}
