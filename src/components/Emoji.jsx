import React from "react";
import emojiMap from "../emoji-map.json";
const emojiSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
export default function Emoji({ text }) {
  return (
    <span className="emoji" aria-hidden="true">
      {[...emojiSegmenter.segment(text)].map(({ segment }, i) =>
        emojiMap[segment] ? (
          <img key={i} src={emojiMap[segment]} alt="" draggable="false" />
        ) : (
          segment
        ),
      )}
    </span>
  );
}
