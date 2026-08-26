import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const appRoot = join(process.cwd(), 'src/app');

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === 'page.tsx' ? [path] : [];
  });
}

function renderedMainCount(path: string): number {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count = 0;
  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(source) === 'main') count += 1;
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property) || property.name.getText(source) !== 'as') continue;
        if (property.initializer && ts.isStringLiteral(property.initializer) && property.initializer.text === 'main') count += 1;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return count;
}

describe('application main landmark contract', () => {
  it('owns the single main landmark in the root layout', () => {
    const layoutPath = join(appRoot, 'layout.tsx');
    const layout = readFileSync(layoutPath, 'utf8');
    expect(renderedMainCount(layoutPath)).toBe(1);
    expect(layout).toContain('id="main-content"');
  });

  it('does not nest another main landmark inside route pages', () => {
    const offenders = pageFiles(appRoot).filter((path) => renderedMainCount(path) > 0);
    expect(offenders).toEqual([]);
  });
});
