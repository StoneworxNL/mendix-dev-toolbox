using System.Net;
using Stoneworx.DevToolbox;

var port = args.Length > 0 ? args[0] : "5299";
var listener = new HttpListener();
listener.Prefixes.Add($"http://localhost:{port}/");
listener.Start();
Console.WriteLine($"Developer Toolbox: http://localhost:{port}/dev-toolbox/index.html");

while (true)
{
    var context = await listener.GetContextAsync();
    _ = RequestHandler.HandleAsync(context.Request, context.Response, CancellationToken.None);
}
