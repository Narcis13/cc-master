import { h } from "preact";
import { useRef, useEffect } from "preact/hooks";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useTerminal, type TerminalWriter } from "../hooks/useTerminal";

export function TerminalPanel({ jobId }: { jobId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<TerminalWriter | null>(null);

  const { connected, completed } = useTerminal(jobId, writerRef);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39d353",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d364",
        brightWhite: "#f0f6fc",
      },
      fontSize: 12,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
      cursorBlink: false,
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    writerRef.current = (data: string) => term.write(data);

    const onResize = () => fitAddon.fit();
    window.addEventListener("resize", onResize);

    return () => {
      writerRef.current = null;
      window.removeEventListener("resize", onResize);
      term.dispose();
    };
  }, [jobId]);

  return (
    <div class="terminal-panel">
      <div class="terminal-panel-header">
        <span class={`connection-dot ${connected ? "connected" : "disconnected"}`} />
        <span>Terminal Output</span>
        {completed && <span class="terminal-complete-badge">Session ended</span>}
      </div>
      <div ref={containerRef} class="terminal-container" />
    </div>
  );
}
