// The Board app's page (pomade-board): the Board tab and the "Needs you" panel.

import { mountApp } from "../../src/core/mount";
import { boardView } from "../../src/core/views";
import { BoardTab } from "../../src/board/BoardTab";
import { NeedsYouPanel } from "../../src/board/NeedsYouPanel";
import "../../src/board/board.css";

mountApp({
  name: "Board",
  view(host, route) {
    switch (boardView(host.welcome.surface, route)) {
      case "board-tab":
        return <BoardTab host={host} />;
      case "needs-you-panel":
        return <NeedsYouPanel host={host} />;
      case "unknown":
        return null;
    }
  },
});
