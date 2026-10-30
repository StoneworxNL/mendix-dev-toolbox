using System.ComponentModel.Composition;
using Mendix.StudioPro.ExtensionsAPI.UI.DockablePane;
using Mendix.StudioPro.ExtensionsAPI.UI.Tab;
using Mendix.StudioPro.ExtensionsAPI.UI.WebView;

namespace Stoneworx.DevToolbox;

[Export(typeof(DockablePaneExtension))]
public sealed class DevToolboxPane : DockablePaneExtension
{
    public const string PaneId = "stoneworx-dev-toolbox";

    public override string Id => PaneId;

    public override DockablePaneViewModelBase Open() =>
        new DevToolboxPaneViewModel(DevToolboxWebServer.IndexUri(WebServerBaseUrl)) { Title = "Developer Toolbox" };
}

public sealed class DevToolboxPaneViewModel(Uri address) : WebViewDockablePaneViewModel
{
    public override void InitWebView(IWebView webView) => webView.Address = address;
}

public sealed class DevToolboxTabViewModel : WebViewTabViewModel
{
    private readonly Uri address;

    public DevToolboxTabViewModel(Uri address)
    {
        this.address = address;
        Title = "Developer Toolbox";
    }

    public override void InitWebView(IWebView webView) => webView.Address = address;
}
