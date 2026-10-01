import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, type TextStyle, View } from 'react-native';
import { theme } from '../lib/theme';

type Block =
  | { type: 'para'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'section'; n: string; title: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'olist'; items: { n: string; text: string }[] }
  | { type: 'code'; text: string }
  | { type: 'hr' };

const ORDERED = /^(\d{1,2})[.)]\s+(.+)$/;
const BULLET = /^[-*•]\s+(.+)$/;
const HEADING = /^#{1,4}\s+(.+)$/;
const NUMBERED_TITLE = /^(\d{1,2})[.)]?\s+(.+)$/;

function isBullet(line: string): boolean {
  return BULLET.test(line.trim());
}

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }
    if (/^```/.test(t)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'code', text: buf.join('\n') });
      continue;
    }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    const h = t.match(HEADING);
    if (h) {
      const numbered = h[1].trim().match(NUMBERED_TITLE);
      if (numbered) blocks.push({ type: 'section', n: numbered[1], title: numbered[2] });
      else blocks.push({ type: 'heading', text: h[1].trim() });
      i++;
      continue;
    }
    const ord = t.match(ORDERED);
    if (ord) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && isBullet(lines[j])) {
        blocks.push({ type: 'section', n: ord[1], title: ord[2].trim() });
        i++;
        continue;
      }
      const items: { n: string; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(ORDERED);
        if (!m) break;
        items.push({ n: m[1], text: m[2].trim() });
        i++;
      }
      blocks.push({ type: 'olist', items });
      continue;
    }
    if (isBullet(t)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i].trim())) {
        items.push(lines[i].trim().match(BULLET)![1].trim());
        i++;
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }
    const buf: string[] = [t];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i].trim()) &&
      !ORDERED.test(lines[i].trim()) &&
      !isBullet(lines[i].trim()) &&
      !lines[i].trim().startsWith('```')
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'para', text: buf.join(' ') });
  }
  return blocks;
}

function renderInline(text: string, base: TextStyle, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      parts.push(
        <Text key={`${keyPrefix}-${k++}`} style={base}>
          {text.slice(last, m.index)}
        </Text>,
      );
    }
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(
        <Text key={`${keyPrefix}-${k++}`} style={[base, { fontWeight: '700' }]}>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else {
      parts.push(
        <Text key={`${keyPrefix}-${k++}`} style={[base, styles.codeInline]}>
          {tok.slice(1, -1)}
        </Text>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    parts.push(
      <Text key={`${keyPrefix}-${k++}`} style={base}>
        {text.slice(last)}
      </Text>,
    );
  }
  return parts;
}

export function AssistantMessage({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <View>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'section':
            return (
              <View key={idx} style={styles.sectionRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{b.n}</Text>
                </View>
                <Text style={styles.sectionTitle}>
                  {renderInline(b.title, styles.sectionTitle as TextStyle, `s${idx}`)}
                </Text>
              </View>
            );
          case 'heading':
            return (
              <Text key={idx} style={styles.heading}>
                {renderInline(b.text, styles.heading as TextStyle, `h${idx}`)}
              </Text>
            );
          case 'bullets':
            return (
              <View key={idx} style={styles.listGap}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>
                      {renderInline(item, styles.bulletText as TextStyle, `b${idx}-${j}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'olist':
            return (
              <View key={idx} style={styles.listGap}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.olistNum}>{item.n}.</Text>
                    <Text style={styles.bulletText}>
                      {renderInline(item.text, styles.bulletText as TextStyle, `o${idx}-${j}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'code':
            return (
              <View key={idx} style={styles.codeBlock}>
                <Text style={styles.codeText}>{b.text}</Text>
              </View>
            );
          case 'hr':
            return <View key={idx} style={styles.hr} />;
          default:
            return (
              <Text key={idx} style={styles.para}>
                {renderInline(b.text, styles.para as TextStyle, `p${idx}`)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  para: { color: theme.text, fontSize: 16, lineHeight: 24, marginBottom: 10 },
  heading: { color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 8 },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 14, fontWeight: '700', color: theme.text },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.text, flex: 1 },
  listGap: { marginBottom: 10, gap: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  bulletDot: { color: theme.muted, fontSize: 15, lineHeight: 22 },
  olistNum: { color: theme.muted, fontSize: 15, lineHeight: 22, minWidth: 18 },
  bulletText: { color: theme.text, fontSize: 15, lineHeight: 22, flex: 1 },
  codeInline: { backgroundColor: theme.codeBg, borderRadius: 4, fontSize: 14 },
  codeBlock: { backgroundColor: theme.codeBg, borderRadius: 10, padding: 12, marginBottom: 10 },
  codeText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: theme.text },
  hr: { height: 1, backgroundColor: theme.border, marginVertical: 12 },
});
