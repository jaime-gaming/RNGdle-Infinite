import { useEffect, useState } from "react";
import { rngmasStatus } from "./rngmas.js";

export function useRngmasStatus() {
  const [status, setStatus] = useState(() => rngmasStatus());
  useEffect(() => {
    if (status.over) return undefined;
    const timer = setInterval(
      () => setStatus(rngmasStatus()),
      status.active ? 30000 : 60000,
    );
    return () => clearInterval(timer);
  }, [status.active, status.over]);
  return status;
}
