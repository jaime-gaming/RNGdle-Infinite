import React, { useId } from "react";

// Fixed vector scenery; decoration never consumes roll randomness.
// Star positions are a constant list, never random, so every visit matches.
const STARS = [
  [22, 18, 1.2],
  [58, 44, 0.9],
  [96, 12, 1.4],
  [140, 58, 0.8],
  [172, 24, 1.1],
  [215, 48, 0.9],
  [248, 14, 1.3],
  [290, 66, 0.8],
  [318, 30, 1.0],
  [356, 10, 1.2],
  [392, 52, 0.9],
  [430, 22, 1.4],
  [462, 70, 0.8],
  [498, 38, 1.0],
  [526, 12, 1.2],
  [660, 20, 1.1],
  [700, 54, 0.9],
  [728, 16, 1.3],
  [744, 84, 0.8],
  [40, 92, 0.9],
  [120, 104, 1.0],
  [205, 96, 0.8],
  [330, 100, 1.1],
  [410, 108, 0.8],
  [470, 96, 1.0],
  [660, 110, 0.9],
  [740, 128, 1.0],
  [80, 70, 0.7],
  [560, 120, 0.8],
  [600, 14, 0.9],
];
export default function WorldScenery({ zone }) {
  const id = useId().replaceAll(":", "");
  const moonColor =
    zone === "valley"
      ? "#f293a3"
      : zone === "blood-moon-ridge"
        ? "#f05d5d"
        : zone === "pumpkin-patch"
          ? "#eccb9c"
          : zone === "haunted-house"
            ? "#b7e3c5"
            : "#d7d0fa";
  return (
    <svg
      className="world-haunted-scene"
      viewBox="0 0 760 300"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`moon-${id}`}>
          <stop stopColor="#e7ddff" />
          <stop offset="1" stopColor="#bba6ef" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`land-${id}`} x2="0" y2="1">
          <stop stopColor="#352544" />
          <stop offset="1" stopColor="#0b0815" />
        </linearGradient>
        <linearGradient id={`haze-${id}`} x2="0" y2="1">
          <stop stopColor="var(--world-accent)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--world-accent)" stopOpacity=".16" />
        </linearGradient>
        <linearGradient id={`far-${id}`} x2="0" y2="1">
          <stop stopColor="#2d2140" />
          <stop offset="1" stopColor="#1a1226" />
        </linearGradient>
      </defs>
      {/* Sky: a scatter of fixed stars that twinkle in turn, then a soft haze
          in the zone's colour where the sky meets the land. */}
      <g className="world-scene-stars" fill="#e9e1ff">
        {STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} style={{ "--star": i % 7 }} />
        ))}
      </g>
      <rect x="0" y="60" width="760" height="190" fill={`url(#haze-${id})`} />
      <circle cx="583" cy="67" r="64" fill={`url(#moon-${id})`} opacity=".4" />
      <circle
        className="world-scene-moon"
        cx="583"
        cy="67"
        r="27"
        fill={moonColor}
      />
      <path
        d="m91 45 8-4 8 4-8-1zm348 19 12-5 12 5-12-2zm240 40 11-5 11 5-11-1"
        fill="#c2afe6"
        opacity=".5"
      />
      <path
        className="world-scene-far"
        d="M0 206 60 160l58 28 70-58 62 44 84-70 76 60 58-36 72 50 60-30 70 42 50-18 40 24v110H0Z"
        fill={`url(#far-${id})`}
        opacity=".55"
      />
      <path
        d="M0 188 82 117l32 40 99-64 40 64 100-94 61 98 54-50 71 59 67-42 55 54 60-20 39 38v100H0Z"
        fill="#21162f"
      />
      <path
        d="M0 241q104-40 200-15t196-12 183 12 181-24v98H0Z"
        fill={`url(#land-${id})`}
      />
      {zone === "pumpkin-patch" ? (
        <g className="world-scene-patch">
          <path d="M0 247q160-100 340-20t420-9v82H0Z" fill="#402735" />
          <path
            d="M24 248q172-37 361-2t350-10m-712 29q175-32 350-2t360-14m-685 38q170-18 365-1"
            stroke="#bc815828"
            strokeWidth="3"
            fill="none"
          />
          <g
            className="world-scene-fence"
            stroke="#997a76"
            fill="#50363d"
            strokeWidth="2"
          >
            <path d="M138 163v80m45-72v69m42-59v57m267-63v57m49-61v64m47-72v68" />
            <path d="m129 183 105 14m-105 6 105 13m250-20 110-17m-110 38 110-17" />
          </g>
          <g
            className="world-patch-vines"
            fill="none"
            stroke="#91a476"
            strokeWidth="2"
          >
            <path d="M201 290q-22-43 22-58t46 8m87 48q-20-29 13-45t44 3m143 45q-13-42 21-43t34 8" />
          </g>
          {[
            [85, 265, 0.85],
            [257, 253, 1.05],
            [344, 280, 0.8],
            [430, 253, 1.25],
            [568, 269, 0.85],
            [675, 258, 1],
          ].map(([x, y, scale], i) => (
            <g
              key={i}
              transform={`translate(${x} ${y}) scale(${scale})`}
              className="world-patch-pumpkin"
            >
              <ellipse rx="25" ry="20" fill="#b97349" />
              <ellipse rx="15" ry="20" fill="#cf8751" />
              <ellipse rx="6" ry="20" fill="#df995a" />
              <path d="m-2-19 2-11 6-3-2 14" fill="#737c55" />
              <path
                d="m-13-3 7-4-1 8m14-8 7 4-6 4m-11 3 12 2-5 5-8-4"
                fill="#f1c47d"
                className="world-scene-pumpkin-light"
              />
            </g>
          ))}
          {/* A scarecrow keeps watch; fireflies drift over the rows. */}
          <g className="world-patch-scarecrow" stroke="#6b4a3c" strokeWidth="3">
            <path d="M520 262V150m-34 20h68" />
            <circle
              cx="520"
              cy="140"
              r="11"
              fill="#c9a06a"
              stroke="#8a6a46"
              strokeWidth="2"
            />
            <path d="M506 136h28l-14-16Z" fill="#4b3238" stroke="none" />
            <path
              d="M502 172 492 212m46-40 10 40M508 170h24v46l-12 8-12-8Z"
              fill="#5a3c44"
              stroke="#7d5a52"
              strokeWidth="2"
            />
          </g>
          <g className="world-patch-crows" fill="#120a12">
            <path d="m596 139 6-5 4 4 4-4 6 5-6-1-4 3-4-3Z" />
            <path d="m630 128 5-4 3 3 3-3 5 4-5-1-3 2-3-2Z" />
          </g>
          <g className="world-patch-fireflies" fill="#ffe08a">
            {[
              [150, 215],
              [230, 190],
              [305, 225],
              [400, 205],
              [470, 235],
              [560, 195],
              [640, 220],
              [700, 240],
              [90, 235],
              [360, 245],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="1.6" style={{ "--fly": i }} />
            ))}
          </g>
          <g className="world-patch-lanterns" stroke="#c6a474" fill="#614233">
            <path d="M187 88v91m279-82v93M174 143h26v32h-26Zm279 2h26v32h-26Z" />
            <path d="M180 156h14v14h-14Zm279 2h14v14h-14Z" fill="#edc188" />
          </g>
        </g>
      ) : zone === "graveyard" ? (
        <g
          className="world-scene-graves"
          stroke="#806f8d"
          strokeWidth="3"
          fill="#261d35"
        >
          {/* A far row of stones and an iron fence give the yard depth. */}
          <g opacity=".45" strokeWidth="2">
            <path d="M96 246v-24a11 11 0 0 1 22 0v24Zm120-4v-20a10 10 0 0 1 20 0v20Zm190 2v-26a12 12 0 0 1 24 0v26Zm230-2v-22a10 10 0 0 1 20 0v22Zm-110 2v-18a9 9 0 0 1 18 0v18Z" />
          </g>
          <g
            className="world-graveyard-mausoleum"
            stroke="#6f5f7d"
            strokeWidth="2"
          >
            <path d="M324 258v-62l40-24 40 24v62Z" fill="#1d1529" />
            <path d="M352 258v-34a12 12 0 0 1 24 0v34Z" fill="#0f0a18" />
            <path d="M364 176v-16m-6 6h12" stroke="#a2d6c8" />
          </g>
          <g
            className="world-graveyard-fence"
            stroke="#5f4f6d"
            strokeWidth="2"
            fill="none"
          >
            <path d="M0 272h760M0 262h760" />
            <path d="M20 252v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24m30-24v24" />
          </g>
          <path d="M155 250v-51a22 22 0 0 1 44 0v51Z" />
          <path d="M261 249v-67a24 24 0 0 1 48 0v67Z" />
          <path d="M464 255v-44a19 19 0 0 1 38 0v44Z" />
          <path d="M548 239v-49a22 22 0 0 1 44 0v49Z" />
          <path
            d="M177 203v26m-9-16h18M285 180v28m-10-17h20M483 213v19m-7-11h14M570 193v24m-8-15h16"
            stroke="#a2d6c8"
          />
          <path
            d="m92 253 13-8m-9-5 7 18m536-22 10 10m-7-13 4 17"
            stroke="#897878"
          />
        </g>
      ) : zone === "haunted-house" ? (
        <g className="world-scene-house" stroke="#836991" strokeWidth="2">
          <path d="M213 249V136l66-48 43 49 56-31 74 48v95Z" fill="#211528" />
          <path
            d="m191 141 88-67 51 59 48-35 91 62M267 83V44h21v37"
            fill="none"
          />
          <path
            d="M237 247v-50a13 13 0 0 1 26 0v50m81 0v-50a13 13 0 0 1 26 0v50m48 0v-50a13 13 0 0 1 26 0v50"
            fill="#37233f"
          />
          <g className="world-scene-windows" fill="#d9a964" stroke="#e6b870">
            <path d="M259 145h17v23h-17Z" />
            <path d="M296 148h16v24h-16Z" />
            <path d="M374 154h15v24h-15Z" />
            <path d="M412 170h14v18h-14Z" />
          </g>
          <path
            d="m238 100 10 34m-5-19 16-12M334 216l7 18m-1-18 12 11"
            stroke="#b29aac"
          />
          {/* Smoke from the chimney and a lightning flash now and then. */}
          <g
            className="world-house-smoke"
            fill="#9b8fa8"
            opacity=".35"
            stroke="none"
          >
            <circle cx="278" cy="36" r="5" />
            <circle cx="286" cy="24" r="7" />
            <circle cx="298" cy="12" r="9" />
          </g>
          <path
            className="world-house-lightning"
            d="m120 0-22 48 16-4-24 54 38-62-16 4L136 0Z"
            fill="#f3f0ff"
            stroke="none"
          />
          <rect
            className="world-house-flash"
            width="760"
            height="300"
            fill="#dfe6ff"
            stroke="none"
          />
        </g>
      ) : zone === "blood-moon-ridge" ? (
        <g className="world-scene-ridge">
          {/* A bigger, lower red moon: the whole zone is lit by it. */}
          <circle cx="583" cy="67" r="52" fill="#f05d5d22" />
          <path
            d="M0 258 70 171l46 38 58-71 54 52 73-96 66 90 52-44 80 70 60-60 71 68 66-48 64 66v86H0Z"
            fill="#2b1420"
            stroke="#7a2c3c"
            strokeWidth="2"
          />
          <path
            d="M0 274q130-50 262-18t214-20 208 2 76 4v58H0Z"
            fill="#180a14"
          />
          <path
            d="m226 191 2-27 14 9m104-64 1-22 12 8m258 59 3-26 13 9"
            fill="none"
            stroke="#c04a5c"
            strokeWidth="2"
          />
          <g
            className="world-scene-bats"
            fill="#1a0b12"
            stroke="#f0a1a1"
            strokeWidth="1.2"
          >
            <path d="m498 101 9-8 7 6 7-6 9 8-9-2-7 5-7-5Z" />
            <path d="m536 128 7-6 6 5 6-5 7 6-7-1-6 4-6-4Z" />
            <path d="m626 118 8-7 7 6 7-6 8 7-8-2-7 5-7-5Z" />
          </g>
          <path
            className="world-scene-sigils"
            d="M380 262v-50m-16 18 16-12 16 12m-26 20 10-8 10 8"
            fill="none"
            stroke="#f27b8f"
            strokeWidth="2"
          />
          {/* Embers that rise from the slope and fade out. */}
          <g className="world-ridge-embers" fill="#ff9b6a">
            {[
              [120, 250],
              [190, 262],
              [262, 246],
              [330, 266],
              [410, 252],
              [480, 262],
              [540, 248],
              [620, 264],
              [690, 250],
              [60, 262],
              [740, 256],
              [360, 258],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="1.5" style={{ "--ember": i }} />
            ))}
          </g>
        </g>
      ) : (
        <g className="world-scene-valley">
          <path
            d="m192 232 74-158 68 158zm264 5 63-155 72 157Z"
            fill="#372136"
            stroke="#663543"
            strokeWidth="2"
          />
          <path
            d="m241 194 25-81 25 80m206 4 22-78 26 82"
            fill="none"
            stroke="#a14158"
            strokeWidth="2"
          />
          <path
            d="M360 276v-99a28 28 0 0 1 56 0v99"
            fill="#120b1e"
            stroke="#a26a94"
            strokeWidth="3"
          />
          <path
            className="world-scene-sigils"
            d="m369 199 19-25 19 25-19 25Zm19 13v-24m-7 12h14"
            fill="none"
            stroke="#d97b94"
            strokeWidth="2"
          />
          <path
            d="M383 285q-30-25-20-61m39 61q27-25 18-61"
            fill="none"
            stroke="#652f4b"
          />
          {/* A flagstone path leads to the door; six-sigils glow along it. */}
          <path
            d="M300 300q40-30 88-28t84 28"
            fill="none"
            stroke="#3b2033"
            strokeWidth="26"
            strokeLinecap="round"
          />
          <g
            className="world-valley-sigils"
            fill="none"
            stroke="#e0607f"
            strokeWidth="1.6"
          >
            <path d="M340 280a6 6 0 1 0 6-6q-7 0-7 8m65-6a6 6 0 1 0 6-6q-7 0-7 8m48-6a6 6 0 1 0 6-6q-7 0-7 8" />
          </g>
          <g className="world-valley-crows" fill="#0f0810">
            <path d="m160 96 8-6 5 5 5-5 8 6-8-1-5 4-5-4Z" />
            <path d="m196 84 6-5 4 4 4-4 6 5-6-1-4 3-4-3Z" />
            <path d="m630 110 7-6 5 5 5-5 7 6-7-1-5 3-5-3Z" />
          </g>
        </g>
      )}
      {zone === "graveyard" && (
        <g className="world-scene-spirits" fill="#d4cbef22" stroke="#cec2ec55">
          <path d="M374 151c-12-12-26 0-26 14v26l8-7 5 6 7-5 6 4v-22c0-7 2-11 0-16Z" />
          <path d="M607 148c-10-8-21 1-21 11v25l6-6 6 5 5-4 5 3v-23c0-4 1-8-1-11Z" />
          <path d="m356 163 1 2m8-2 1 2m226-7 1 2m7-2 1 2" stroke="#e3d5fa" />
        </g>
      )}
      {zone === "haunted-house" && (
        <g
          className="world-scene-webs"
          fill="none"
          stroke="#a9c7b1"
          opacity=".3"
        >
          <path d="M219 93h66v47M220 94q37 10 64 46m-63-44q17 38 62 44m-62-45 62 45m-43-31q6-1 16-10m-7 28q8-3 18-12" />
        </g>
      )}
      {(zone === "valley" || zone === "blood-moon-ridge") && (
        <g className="world-blood-moon-rings" fill="none" stroke="#ef7c9855">
          <circle cx="583" cy="67" r="34" />
          <circle cx="583" cy="67" r="45" strokeDasharray="2 7" />
        </g>
      )}
      <g stroke="#4e3a58" strokeWidth="5" fill="none">
        <path d="M61 262 76 139l-27-41m25 62 38-56m-43 91-33-34M693 273l-21-140 32-39m-26 68-40-45m47 91 31-26" />
      </g>
      <g fill="#e29955">
        <ellipse cx="122" cy="256" rx="15" ry="11" />
        <ellipse cx="627" cy="260" rx="13" ry="10" />
      </g>
      <path
        d="m115 254 5-2-2 5m10-5 5 2-3 3m-6 1 6 2-7 2m497-6 4-2-1 5m7-4 4 2-2 2"
        fill="#60333a"
      />
    </svg>
  );
}
