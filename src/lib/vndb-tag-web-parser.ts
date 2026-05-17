export interface VndbTagBreadcrumb {
  id: string | null;
  name: string;
  href: string | null;
}

export interface VndbTagTreeNode {
  id: string;
  name: string;
  count?: number | null;
  href: string;
  children?: VndbTagTreeNode[];
  moreCount?: number | null;
}

export interface VndbTagTreeGroup {
  id: string;
  label: string;
  href: string;
  children: VndbTagTreeNode[];
  moreCount?: number | null;
}

export interface VndbTagListItem {
  id: string;
  name: string;
  href: string;
  count?: number | null;
  dateLabel?: string | null;
}

export interface VndbTagHomeTree {
  groups: VndbTagTreeGroup[];
  recentlyAdded: VndbTagListItem[];
  popular: VndbTagListItem[];
  recentlyTaggedHref?: string | null;
}

export interface VndbTagWebDetail {
  id: string;
  name: string;
  breadcrumb: VndbTagBreadcrumb[];
  descriptionText?: string | null;
  properties: {
    searchable?: boolean | null;
    applicable?: boolean | null;
  };
  categoryLabel?: string | null;
  aliases?: string[];
  childGroups: Array<{
    title: string;
    children: VndbTagTreeNode[];
  }>;
}

const TAG_TREE_RE = /<ul[^>]*class="[^"]*\btagtree\b[^"]*"[^>]*>/i;
const TAG_LINK_RE = /<a\s+[^>]*href="\/(g\d+)"[^>]*>([\s\S]*?)<\/a>/i;
const ALL_TAG_LINK_RE = /<a\s+[^>]*href="\/(g\d+)"[^>]*>([\s\S]*?)<\/a>(?:\s*<small>\s*\(([\d,]+)\)\s*<\/small>)?/gi;

export function decodeHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHref(id: string): string {
  return `/tag/${id.toLowerCase()}?tab=vndb`;
}

function parseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function findMatchingClose(html: string, openTagStart: number, tagName: string): number {
  const openEnd = html.indexOf('>', openTagStart);
  if (openEnd < 0) return -1;
  const tagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = openTagStart;
  let depth = 0;
  for (;;) {
    const m = tagRe.exec(html);
    if (!m) return -1;
    const isClose = /^<\//.test(m[0]);
    if (isClose) {
      depth -= 1;
      if (depth === 0) return m.index;
    } else {
      depth += 1;
    }
  }
}

function extractFirstTagTree(html: string, from = 0): string | null {
  TAG_TREE_RE.lastIndex = 0;
  const slice = html.slice(from);
  const m = TAG_TREE_RE.exec(slice);
  if (!m) return null;
  const start = from + m.index;
  const openEnd = html.indexOf('>', start);
  const close = findMatchingClose(html, start, 'ul');
  if (openEnd < 0 || close < 0) return null;
  return html.slice(openEnd + 1, close);
}

function extractFirstUl(html: string, from = 0): string | null {
  const m = /<ul\b[^>]*>/i.exec(html.slice(from));
  if (!m) return null;
  const start = from + m.index;
  const openEnd = html.indexOf('>', start);
  const close = findMatchingClose(html, start, 'ul');
  if (openEnd < 0 || close < 0) return null;
  return html.slice(openEnd + 1, close);
}

function sectionAfterHeading(html: string, heading: string): string | null {
  const h = new RegExp(`<h1[^>]*>\\s*${escapeRegExp(heading)}\\s*<\\/h1>`, 'i').exec(html);
  if (!h) return null;
  const after = h.index + h[0].length;
  const nextArticle = html.indexOf('</article>', after);
  return html.slice(after, nextArticle > after ? nextArticle : undefined);
}

function extractTopLevelListItems(ulInner: string): string[] {
  const out: string[] = [];
  const liRe = /<\/?li\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(ulInner))) {
    if (/^<\//.test(m[0])) continue;
    const contentStart = liRe.lastIndex;
    let depth = 1;
    let closeStart = -1;
    while ((m = liRe.exec(ulInner))) {
      if (/^<\//.test(m[0])) {
        depth -= 1;
        if (depth === 0) {
          closeStart = m.index;
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (closeStart >= 0) out.push(ulInner.slice(contentStart, closeStart));
  }
  return out;
}

function parseTagNode(li: string): VndbTagTreeNode | null {
  const m = TAG_LINK_RE.exec(li);
  if (!m) return null;
  const id = m[1].toLowerCase();
  const name = decodeHtml(m[2]);
  const countMatch = new RegExp(`<a\\s+[^>]*href="/${id}"[^>]*>[\\s\\S]*?<\\/a>\\s*<small>\\s*\\(([\\d,]+)\\)\\s*<\\/small>`, 'i').exec(li);
  const nested = extractFirstUl(li);
  const children = nested ? parseTreeNodes(nested) : [];
  const moreNode = children.find((child) => /\bmore tags?\b/i.test(child.name));
  return {
    id,
    name,
    count: parseCount(countMatch?.[1]),
    href: normalizeHref(id),
    children: children.filter((child) => !/\bmore tags?\b/i.test(child.name)),
    moreCount: moreNode ? parseCount(moreNode.name) : null,
  };
}

function parseTreeNodes(ulInner: string): VndbTagTreeNode[] {
  return extractTopLevelListItems(ulInner)
    .map(parseTagNode)
    .filter((node): node is VndbTagTreeNode => !!node);
}

export function parseVndbTagHomeTree(html: string): VndbTagHomeTree {
  const tree = extractFirstTagTree(html) ?? '';
  const groups = extractTopLevelListItems(tree)
    .map((li): VndbTagTreeGroup | null => {
      const node = parseTagNode(li);
      if (!node) return null;
      return {
        id: node.id,
        label: node.name,
        href: node.href,
        children: node.children ?? [],
        moreCount: node.moreCount ?? null,
      };
    })
    .filter((group): group is VndbTagTreeGroup => !!group);

  const recentBlock = sectionAfterHeading(html, 'Recently added') ?? '';
  const popularBlock = sectionAfterHeading(html, 'Popular') ?? '';
  const recentlyTaggedHref = /<a\s+[^>]*href="([^"]*\/g\/links[^"]*)"[^>]*>Recently tagged<\/a>/i.exec(html)?.[1] ?? null;

  return {
    groups,
    recentlyAdded: parseSimpleTagList(recentBlock),
    popular: parseSimpleTagList(popularBlock),
    recentlyTaggedHref,
  };
}

function parseSimpleTagList(html: string): VndbTagListItem[] {
  const out: VndbTagListItem[] = [];
  for (const m of html.matchAll(ALL_TAG_LINK_RE)) {
    const before = html.slice(Math.max(0, m.index - 140), m.index);
    const dateLabel = /<abbr[^>]*>([\s\S]*?)<\/abbr>\s*$/i.exec(before)?.[1];
    out.push({
      id: m[1].toLowerCase(),
      name: decodeHtml(m[2]),
      href: normalizeHref(m[1]),
      count: parseCount(m[3]),
      dateLabel: dateLabel ? decodeHtml(dateLabel) : null,
    });
  }
  return dedupeById(out);
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function parseVndbTagWebDetail(html: string, fallbackId: string): VndbTagWebDetail {
  const id = fallbackId.toLowerCase();
  const h1 = /<h1[^>]*>\s*Tag:\s*([\s\S]*?)<\/h1>/i.exec(html);
  const name = h1 ? decodeHtml(h1[1]) : id;
  const breadcrumbBlock = h1 ? firstTagAfter(html, h1.index + h1[0].length, 'p') : null;
  const breadcrumb = breadcrumbBlock ? parseBreadcrumb(breadcrumbBlock, name, id) : [];
  const desc = /<div\s+class="description"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const categoryLabel = /<strong>\s*Category\s*<\/strong>\s*<br\s*\/?>\s*([\s\S]*?)<\/p>/i.exec(html)?.[1];
  const aliasesBlock = /<strong>\s*Aliases\s*<\/strong>\s*<br\s*\/?>\s*([\s\S]*?)<\/p>/i.exec(html)?.[1];
  const childSection = sectionAfterHeading(html, 'Child tags');
  const childTree = childSection ? extractFirstTagTree(childSection) : null;
  const childGroups = childTree ? normalizeChildGroups(parseTreeNodes(childTree)) : [];
  const allText = decodeHtml(html).toLowerCase();

  return {
    id,
    name,
    breadcrumb,
    descriptionText: desc ? decodeHtml(desc) : null,
    properties: {
      searchable: allText.includes('not searchable') ? false : allText.includes('searchable') ? true : null,
      applicable: allText.includes('can not be directly applied') || allText.includes('cannot be directly applied')
        ? false
        : allText.includes('directly applied')
          ? true
          : null,
    },
    categoryLabel: categoryLabel ? decodeHtml(categoryLabel) : null,
    aliases: aliasesBlock ? decodeHtml(aliasesBlock).split(/\s*[,;]\s*|\s{2,}/).filter(Boolean) : [],
    childGroups,
  };
}

function normalizeChildGroups(nodes: VndbTagTreeNode[]): VndbTagWebDetail['childGroups'] {
  const groups: VndbTagWebDetail['childGroups'] = [];
  const loose: VndbTagTreeNode[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      groups.push({ title: node.name, children: node.children });
    } else {
      loose.push(node);
    }
  }
  if (loose.length > 0) groups.push({ title: 'Child tags', children: loose });
  return groups;
}

function firstTagAfter(html: string, from: number, tagName: string): string | null {
  const open = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html.slice(from));
  if (!open) return null;
  const start = from + open.index;
  const openEnd = html.indexOf('>', start);
  const close = findMatchingClose(html, start, tagName);
  if (openEnd < 0 || close < 0) return null;
  return html.slice(openEnd + 1, close);
}

function parseBreadcrumb(html: string, selfName: string, selfId: string): VndbTagBreadcrumb[] {
  const crumbs: VndbTagBreadcrumb[] = [];
  if (/\bTags\b/i.test(decodeHtml(html))) {
    crumbs.push({ id: null, name: 'Tags', href: '/tags?mode=vndb' });
  }
  for (const m of html.matchAll(ALL_TAG_LINK_RE)) {
    crumbs.push({
      id: m[1].toLowerCase(),
      name: decodeHtml(m[2]),
      href: normalizeHref(m[1]),
    });
  }
  if (!crumbs.some((crumb) => crumb.id === selfId.toLowerCase())) {
    crumbs.push({ id: selfId.toLowerCase(), name: selfName, href: null });
  }
  return crumbs;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
