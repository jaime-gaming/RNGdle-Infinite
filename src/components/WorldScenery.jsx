import React, { useId } from "react";

// Fixed vector scenery; decoration never consumes roll randomness.
export default function WorldScenery({ zone }) {
  const id = useId().replaceAll(":", "");
  const moonColor =
    zone === "valley"
      ? "#f293a3"
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
      </defs>
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
      {zone === "valley" && (
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
