// File loading utilities for context injection

import { glob } from "glob";
import { readFileSync, statSync } from "fs";
import { resolve, relative } from "path";

export interface FileContent {
  path: string;
  content: string;
}

export async function loadFiles(
  patterns: string[],
  baseDir: string = process.cwd()
): Promise<FileContent[]> {
  const files: FileContent[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    // Handle negation patterns
    if (pattern.startsWith("!")) {
      const negPattern = pattern.slice(1);
      const matches = await glob(negPattern, { cwd: baseDir, absolute: true });
      for (const match of matches) {
        seen.delete(match);
      }
      continue;
    }

    const matches = await glob(pattern, { cwd: baseDir, absolute: true });

    for (const match of matches) {
      if (seen.has(match)) continue;

      try {
        const stat = statSync(match);
        if (!stat.isFile()) continue;

        // Skip binary files and very large files
        if (stat.size > 500000) continue; // 500KB limit

        const content = readFileSync(match, "utf-8");

        // Skip binary content
        if (content.includes("\0")) continue;

        seen.add(match);
        files.push({
          path: relative(baseDir, match),
          content,
        });
      } catch {
        // Skip files we can't read
      }
    }
  }

  return files;
}

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function formatPromptWithFiles(
  prompt: string,
  files: FileContent[]
): string {
  if (files.length === 0) return prompt;

  let result = prompt + "\n\n---\n\n## File Context\n\n";

  for (const file of files) {
    const ext = file.path.split(".").pop() || "";
    result += `### ${file.path}\n\n\`\`\`${ext}\n${file.content}\n\`\`\`\n\n`;
  }

  return result;
}

export async function loadCodebaseMap(cwd: string): Promise<string | null> {
  const mapPaths = [
    resolve(cwd, "docs/CODEBASE_MAP.md"),
    resolve(cwd, "CODEBASE_MAP.md"),
    resolve(cwd, "docs/ARCHITECTURE.md"),
  ];

  for (const mapPath of mapPaths) {
    try {
      const content = readFileSync(mapPath, "utf-8");
      return content;
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Find the codebase map file path (without reading content).
 * Returns a relative path suitable for agent file references.
 */
export function findCodebaseMapPath(cwd: string): string | null {
  const candidates = [
    "docs/CODEBASE_MAP.md",
    "CODEBASE_MAP.md",
    "docs/ARCHITECTURE.md",
  ];

  for (const candidate of candidates) {
    try {
      statSync(resolve(cwd, candidate));
      return candidate;
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Resolve glob patterns to file paths (without reading content).
 * Returns relative paths for agent file references.
 */
export async function resolveFileRefs(
  patterns: string[],
  baseDir: string = process.cwd()
): Promise<string[]> {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      const negPattern = pattern.slice(1);
      const matches = await glob(negPattern, { cwd: baseDir, absolute: true });
      for (const match of matches) {
        seen.delete(match);
      }
      continue;
    }

    const matches = await glob(pattern, { cwd: baseDir, absolute: true });

    for (const match of matches) {
      if (seen.has(match)) continue;

      try {
        const stat = statSync(match);
        if (!stat.isFile()) continue;
        if (stat.size > 500000) continue;

        seen.add(match);
        files.push(relative(baseDir, match));
      } catch {
        // Skip files we can't read
      }
    }
  }

  return files;
}

/**
 * Format prompt with file references (not inlined content).
 * Agent will read these files itself using the Read tool.
 */
export function formatPromptWithFileRefs(
  prompt: string,
  filePaths: string[]
): string {
  if (filePaths.length === 0) return prompt;

  const fileList = filePaths.map((f) => `- ${f}`).join("\n");
  return `IMPORTANT: Before starting, read these files for context:\n${fileList}\n\n${prompt}`;
}
