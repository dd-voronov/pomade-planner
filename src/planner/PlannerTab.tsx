import { useCallback, useEffect, useState } from "react";
import type { HostClient } from "pomade-kit/sdk";

import { parseItemRoute, ROUTES } from "../core/views";
import { Planner } from "./Planner";
import { SettingsPage } from "./SettingsPage";
import { useAddedEvents } from "./useAddedItem";
import type { PlannerViewId } from "./model/view-state";
import type { ItemAsk } from "./useOpenItem";

/**
 * The Planner in a full tab: the panel's views with more room, its settings page (route
 * `settings`), the Workspace Today on request (route `today`, the morning summary's click), and an
 * item's compact view on request (an item route, a click on the panel's row), and the items the
 * quick-add overlay adds (`item.added`). Leaving the page a
 * route asked for — the settings page closed, another view picked — takes the tab back to
 * `planner`, so the next ask for that route reaches it again as a route change; an item route is
 * left as soon as it is taken, so a second click on the same row asks again.
 */
export function PlannerTab({ host, route }: { host: HostClient; route: string }) {
  const [showSettings, setShowSettings] = useState(route === ROUTES.settings);
  const [todayAsks, setTodayAsks] = useState(0);
  const [itemAsk, setItemAsk] = useState<ItemAsk>();
  const addedAsk = useAddedEvents(host);
  useEffect(() => {
    setShowSettings(route === ROUTES.settings);
    if (route === ROUTES.today) setTodayAsks((n) => n + 1);
    const path = parseItemRoute(route);
    if (path === null) return;
    setItemAsk((ask) => ({ path, n: (ask?.n ?? 0) + 1 }));
    void host.tabs.openApp({ route: ROUTES.planner }).catch(() => undefined);
  }, [host, route]);
  const release = useCallback(() => {
    if (route === ROUTES.settings || route === ROUTES.today) void host.tabs.openApp({ route: ROUTES.planner }).catch(() => undefined);
  }, [host, route]);
  const onShowSettings = useCallback(
    (show: boolean) => {
      setShowSettings(show);
      if (!show) release();
    },
    [release],
  );
  const onSelectView = useCallback(
    (view: PlannerViewId) => {
      if (view !== "today") release();
    },
    [release],
  );
  return (
    <Planner
      host={host}
      surface="tab"
      showSettings={showSettings}
      onShowSettings={onShowSettings}
      todayAsks={todayAsks}
      itemAsk={itemAsk}
      addedAsk={addedAsk}
      onSelectView={onSelectView}
      settingsPage={(props) => <SettingsPage {...props} />}
    />
  );
}
