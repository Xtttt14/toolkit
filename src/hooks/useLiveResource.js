import { useCallback, useEffect, useRef, useState } from "react";

export default function useLiveResource(api, method, event) {
  const [state, setState] = useState({ data: null, status: "loading" });
  const generation = useRef(0);
  const mounted = useRef(false);
  const setData = useCallback(data => {
    if (!mounted.current) return;
    generation.current += 1;
    setState({ data, status: "ready" });
  }, []);
  const retry = useCallback(async () => {
    const request = ++generation.current;
    setState(previous => ({ ...previous, status: "loading" }));
    try {
      if (typeof api?.[method] !== "function") throw new Error("数据接口暂不可用");
      const data = await api[method]();
      if (data == null) throw new Error("未能读取数据");
      if (mounted.current && generation.current === request) setState({ data, status: "ready" });
    } catch {
      if (mounted.current && generation.current === request) {
        setState(previous => ({ ...previous, status: "error" }));
      }
    }
  }, [api, method]);
  useEffect(() => {
    mounted.current = true;
    const off = api?.[event]?.(setData);
    retry();
    return () => {
      mounted.current = false;
      generation.current += 1;
      off?.();
    };
  }, [api, event, retry, setData]);
  return { ...state, retry, setData };
}
