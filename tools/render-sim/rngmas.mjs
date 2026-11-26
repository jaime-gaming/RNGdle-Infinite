// Render checks for the RNGmas shelf, calendar and golem card.
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  AdventCalendar,
  GolemSmash,
  RngmasEventNotice,
  WinterChapters,
} from "../../src/components/Rngmas.jsx";
import RngmasAura from "../../src/components/RngmasAura.jsx";
import RngmasDecor from "../../src/components/RngmasDecor.jsx";
import { RNGMAS_WEEKS, emptyRngmas } from "../../src/rngmas.js";

const results = [];
function check(ok, label) {
  results.push({ ok, label });
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}`);
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return { root, host };
}

const SEASON = Date.UTC(2026, 11, 10, 12);

export async function run() {
  const profile = { id: "p1", username: "LuckyTester", createdAt: 1 };
  const progress = (extra = {}) => ({
    profile,
    balance: 1_000_000,
    owned: [],
    history: [],
    rngmas: emptyRngmas(),
    ...extra,
  });
  const status = {
    active: true,
    upcoming: false,
    over: false,
    shown: true,
    now: SEASON,
    endsInMs: 3600000,
    startsInMs: 0,
    week: RNGMAS_WEEKS[1],
  };

  {
    const { root, host } = mount(
      <AdventCalendar
        record={progress().rngmas}
        status={status}
        onClaim={() => {}}
        pending={false}
      />,
    );
    await settle();
    const doors = host.querySelectorAll(".advent-door");
    check(doors.length === 24, "the calendar shows 24 doors");
    check(
      host.querySelectorAll(".advent-star").length === 1,
      "the Christmas star is on the calendar",
    );
    const open = [...doors].filter((door) => !door.disabled);
    check(open.length === 1, "only today is claimable");
    check(
      open.every((door) =>
        /Advent door 10,/.test(door.getAttribute("aria-label") ?? ""),
      ),
      "the only open door is day 10",
    );
    act(() => root.unmount());
  }

  {
    let claimed = 0;
    const { root, host } = mount(
      <AdventCalendar
        record={progress().rngmas}
        status={status}
        onClaim={(day) => {
          claimed += day;
        }}
        pending={false}
      />,
    );
    await settle();
    const door = [...host.querySelectorAll(".advent-door")].find(
      (entry) => !entry.disabled,
    );
    act(() => door.click());
    check(claimed === 10, "clicking an open door claims it");
    act(() => root.unmount());
  }

  {
    let prepared = 0;
    const { root, host } = mount(
      <GolemSmash
        progress={progress()}
        status={{
          ...status,
          now: Date.UTC(2026, 11, 2),
          week: RNGMAS_WEEKS[0],
        }}
        onSmash={() => prepared++}
        pending={false}
      />,
    );
    await settle();
    check(
      host.textContent.includes("25,000,000"),
      "golem damage target is explicit",
    );
    const button = [...host.querySelectorAll("button")].find((node) =>
      node.textContent.includes("Prepare strike"),
    );
    check(Boolean(button) && !button.disabled, "a strike can be prepared");
    act(() => button.click());
    check(prepared === 1, "preparation is wired");
    act(() => root.unmount());
  }
  {
    const state = progress();
    state.rngmas.golems.ember.defeated = true;
    const { root, host } = mount(
      <GolemSmash progress={state} status={status} pending={false} />,
    );
    await settle();
    check(
      host.textContent.includes("In your collection"),
      "claimed activity shows its receipt",
    );
    check(
      host.textContent.includes("Emberlight"),
      "the reward is named before and after collection",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount(
      <WinterChapters
        progress={progress()}
        status={status}
        onAction={() => {}}
      />,
    );
    await settle();
    check(
      host.querySelectorAll(".winter-chapter").length === 5,
      "the season lists five expandable chapter zones",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount(
      <RngmasEventNotice progress={progress()} onOpenShelf={() => {}} />,
    );
    await settle();
    check(
      host.querySelector('[data-testid="rngmas-event-button"]') !== null,
      "the event banner renders outside the season",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount(<RngmasAura aura="rngmas-star" />);
    await settle();
    const aura = host.querySelector(".rngmas-aura");
    check(Boolean(aura), "a winter aura draws its ornament");
    check(
      aura?.querySelectorAll(".aura-seal").length === 1 &&
        aura?.querySelectorAll(".aura-filigree").length === 1,
      "the winter aura has a seal and filigree",
    );
    check(
      aura?.querySelectorAll(".aura-crest").length === 1 &&
        aura?.querySelectorAll(".aura-guardian").length === 2,
      "the winter aura has a crest and two guardians",
    );
    check(
      aura?.querySelectorAll(".aura-motes i").length === 8,
      "the winter aura has eight motes",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount(<RngmasAura aura="jack-o-glow" />);
    await settle();
    check(
      host.querySelector(".rngmas-aura") === null,
      "other events keep their own aura art",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount(
      <RngmasDecor
        status={{
          active: true,
          shown: true,
          over: false,
          now: SEASON,
        }}
      />,
    );
    await settle();
    const decor = host.querySelector(".rngmas-decor");
    check(Boolean(decor), "the snow decoration layer renders");
    check(
      decor?.querySelectorAll(".rngmas-snowfield i").length === 22,
      "the snow field has its flakes",
    );
    check(
      decor?.querySelectorAll(".rngmas-snowbank").length === 2,
      "both snow banks are drawn",
    );
    check(
      decor?.querySelectorAll(".rngmas-pine, .rngmas-gift, .rngmas-bell")
        .length >= 5,
      "the side ornaments are drawn",
    );
    act(() => root.unmount());
  }

  const failed = results.filter((entry) => !entry.ok);
  assert.equal(failed.length, 0, `${failed.length} RNGmas check(s) failed`);
}
