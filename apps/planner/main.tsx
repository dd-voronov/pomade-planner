// The Planner app's page (pomade-planner): the Planner panel and tab, and the quick-add overlay.

import { mountApp } from "../../src/core/mount";
import { plannerView } from "../../src/core/views";
import { PlannerPanel } from "../../src/planner/PlannerPanel";
import { PlannerTab } from "../../src/planner/PlannerTab";
import { QuickAdd } from "../../src/planner/QuickAdd";
import "../../src/planner/planner.css";
import "../../src/planner/add-form.css";

mountApp({
  name: "Planner",
  view(host, route) {
    switch (plannerView(host.welcome.surface, route)) {
      case "planner-panel":
        return <PlannerPanel host={host} route={route} />;
      case "planner-tab":
        return <PlannerTab host={host} route={route} />;
      case "quick-add":
        return <QuickAdd host={host} route={route} />;
      case "unknown":
        return null;
    }
  },
});
