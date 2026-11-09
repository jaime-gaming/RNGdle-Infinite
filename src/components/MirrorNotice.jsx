import React from "react";
import { GAME_URL } from "../site-links.js";

export default function MirrorNotice() {
  return (
    <aside className="mirror-notice" role="note">
      This is a legacy mirror. Play the current game at{" "}
      <a href={`${GAME_URL}/`}>{GAME_URL.replace("https://", "")}</a>.
    </aside>
  );
}
