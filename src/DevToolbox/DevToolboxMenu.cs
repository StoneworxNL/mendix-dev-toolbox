using System.ComponentModel.Composition;
using Mendix.StudioPro.ExtensionsAPI.UI.Menu;
using Mendix.StudioPro.ExtensionsAPI.UI.Services;

namespace Stoneworx.DevToolbox;

[Export(typeof(MenuExtension))]
[method: ImportingConstructor]
public sealed class DevToolboxMenu(IDockingWindowService dockingWindowService) : MenuExtension
{
    public override IEnumerable<MenuViewModel> GetMenus()
    {
        yield return new MenuViewModel("Open Developer Toolbox", OpenTab);
        yield return new MenuViewModel("Open Developer Toolbox as pane", () => dockingWindowService.OpenPane(DevToolboxPane.PaneId));
    }

    private void OpenTab() => dockingWindowService.OpenTab(new DevToolboxTabViewModel(DevToolboxWebServer.IndexUri(WebServerBaseUrl)));
}
