"use strict";

import { initNavigation, initTheme } from "./modules/navi-core.js";
import { initHistory } from "./modules/navi-history.js";
import { initMemoryUI } from "./modules/navi-memory-ui.js";
import { initNaviAuth } from "./modules/navi-ui-auth.js";
import { initNaviChat } from "./modules/navi-chat.js";
import { initStoryMaker } from "./modules/navi-story.js";

initNavigation();
initTheme();
initHistory();
initMemoryUI();
initNaviAuth();
initNaviChat();
initStoryMaker();
