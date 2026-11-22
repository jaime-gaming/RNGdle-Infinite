// Render checks for the RNGmas shelf, calendar and golem card.
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  AdventCalendar,
  GolemSmash,
  RngmasEventNotice,
  RngmasWeeks,
} from "../../src/components/Rngmas.jsx";
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
    check(open.length === 3, "exactly the last three days are claimable");
    check(
      open.every((door) =>
        /Advent door (8|9|10),/.test(door.getAttribute("aria-label") ?? ""),
      ),
      "the open doors are days 8, 9 and 10",
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
    check(claimed === 8, "clicking an open door claims it");
    act(() => root.unmount());
  }

  {
    let smashed = 0;
    const { root, host } = mount(
      <GolemSmash
        progress={progress()}
        status={status}
        onSmash={() => {
          smashed += 1;
        }}
        pending={false}
      />,
    );
    await settle();
    check(
      host.textContent.includes("Ember Golem"),
      "the weekly golem is named",
    );
    check(
      host.textContent.includes("1,500,000") &&
        host.textContent.includes("1,500,000"),
      "the golem health is shown",
    );
    const button = host.querySelector(".golem-smash-button");
    check(Boolean(button) && !button.disabled, "the smash button is enabled");
    act(() => button.click());
    check(smashed === 1, "clicking smash calls the action");
    act(() => root.unmount());
  }

  {
    const { root, host } = mount(
      <GolemSmash
        progress={progress({
          rngmas: {
            ...emptyRngmas(),
            golems: {
              ...emptyRngmas().golems,
              ember: { damage: 1_500_000, strikes: 25, defeated: true },
            },
          },
        })}
        status={status}
        onSmash={() => {}}
        pending={false}
      />,
    );
    await settle();
    check(
      host.textContent.includes("defeated"),
      "a defeated golem shows its state",
    );
    check(
      host.textContent.includes("Emberlight"),
      "the defeated golem names its aura",
    );
    check(
      !host.querySelector(".golem-smash-button"),
      "a defeated golem cannot be smashed again",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount(<RngmasWeeks progress={progress()} />);
    await settle();
    check(
      host.querySelectorAll(".rngmas-week-timeline li").length === 5,
      "the season lists five weeks",
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

  const failed = results.filter((entry) => !entry.ok);
  assert.equal(failed.length, 0, `${failed.length} RNGmas check(s) failed`);
}
