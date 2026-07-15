import { StyleSheet, Text, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { splitBionicWord } from '@/utils/bionic';

export function BionicText({ text, style }: { text: string; style?: TextStyle }) {
  const theme = useTheme();
  const tokens = text.split(/(\s+)/);

  return (
    <Text style={[{ color: theme.text }, style]}>
      {tokens.map((token, i) => {
        if (token === '' || /^\s+$/.test(token)) return token;
        const { bold, rest } = splitBionicWord(token);
        return (
          <Text key={i}>
            <Text style={styles.bold}>{bold}</Text>
            {rest}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontWeight: '700',
  },
});
