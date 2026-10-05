import { Linking } from 'react-native';
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown';
import { normalizeMath } from '../lib/format';
import { theme } from '../lib/theme';

const markdownStyle: MarkdownStyle = {
  paragraph: { fontSize: 16, lineHeight: 24, color: theme.text, marginBottom: 10 },
  h1: { fontSize: 24, fontWeight: '700', color: theme.text, marginTop: 6, marginBottom: 8 },
  h2: { fontSize: 20, fontWeight: '700', color: theme.text, marginTop: 6, marginBottom: 8 },
  h3: { fontSize: 17, fontWeight: '700', color: theme.text, marginTop: 6, marginBottom: 8 },
  h4: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 6, marginBottom: 6 },
  h5: { fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 6, marginBottom: 6 },
  h6: { fontSize: 14, fontWeight: '700', color: theme.muted, marginTop: 6, marginBottom: 6 },
  list: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.text,
    bulletColor: theme.muted,
    markerColor: theme.muted,
  },
  link: { color: theme.accent },
  code: { backgroundColor: theme.codeBg, fontSize: 14, color: theme.text },
  codeBlock: {
    backgroundColor: theme.codeBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 13,
    color: theme.text,
  },
  blockquote: {
    borderColor: theme.border,
    backgroundColor: theme.card,
    color: theme.muted,
    marginBottom: 10,
  },
  thematicBreak: { color: theme.border, marginTop: 12, marginBottom: 12 },
  math: { color: theme.text, marginTop: 4, marginBottom: 10 },
  inlineMath: { color: theme.text },
  table: {
    fontSize: 14,
    borderColor: theme.border,
    borderRadius: 8,
    headerBackgroundColor: theme.card,
    marginBottom: 10,
  },
};

export function AssistantMessage({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <EnrichedMarkdownText
      markdown={normalizeMath(content)}
      flavor="github"
      markdownStyle={markdownStyle}
      streamingAnimation={streaming}
      onLinkPress={({ url }) => {
        void Linking.openURL(url);
      }}
    />
  );
}
