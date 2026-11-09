import { useEffect, useState } from "react";
import { blackFridayStatus } from "./black-friday.js";

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
