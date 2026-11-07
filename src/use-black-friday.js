import { useEffect, useState } from "react";
import { blackFridayStatus } from "./black-friday.js";

// The sale has one edge to watch: the day it runs. Everything that changes when
// the event opens or closes — the ticker, the two extra colour themes, the app
// icon, the shop's counters — reads the same status from here, so they can never
// disagree about what day it is.
//
// While the day is on it ticks every second (the countdown is on screen);
// before it, a minute is plenty, and after it the state stops changing at all.
export function useSaleStatus() {
  const [status, setStatus] = useState(() => blackFridayStatus());
  useEffect(() => {
    if (status.over) return undefined;
    const timer = setInterval(
      () => setStatus(blackFridayStatus()),
      status.active ? 1000 : 60000,
    );
    return () => clearInterval(timer);
  }, [status.active, status.over]);
  return status;
}
