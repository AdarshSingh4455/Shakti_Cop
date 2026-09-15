import React from 'react';
import { tt } from '../context/LocaleContext';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme/colors';
import { reportError } from '../utils/sentry';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorStack: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'अज्ञात त्रुटि', errorStack: error?.stack || '' };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
    reportError(error, { componentStack: info?.componentStack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={48} color={colors.alert} />
          <Text style={styles.title}>{tt('कुछ गड़बड़ हो गई')}</Text>
          <Text style={styles.message}>
            {tt('इस स्क्रीन में एक अनपेक्षित त्रुटि आई — ऐप बंद होने की बजाय यह संदेश दिखाया जा रहा है। नीचे असली त्रुटि दिख रही है — इसका screenshot भेजने से समस्या ठीक करने में मदद मिलेगी।')}
          </Text>

          <View style={styles.errorBox}>
            <Text style={styles.errorBoxLabel}>{tt('त्रुटि संदेश:')}</Text>
            <ScrollView style={styles.errorScroll} nestedScrollEnabled>
              <Text style={styles.errorText} selectable>
                {this.state.errorMessage}
                {this.state.errorStack ? `\n\n${this.state.errorStack}` : ''}
              </Text>
            </ScrollView>
          </View>

          <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.retryBtnText}>{tt('दोबारा कोशिश करें')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.sand },
  title: { fontSize: 18, fontWeight: '800', color: colors.inkNavy, marginTop: 16 },
  message: { fontSize: 13, color: colors.inkGrey, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  errorBox: { backgroundColor: '#2A1215', borderRadius: radius.md, padding: 12, marginTop: 18, width: '100%', maxHeight: 260 },
  errorBoxLabel: { color: '#FF9E8A', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  errorScroll: { maxHeight: 220 },
  errorText: { color: '#FFD9CE', fontSize: 11, fontFamily: 'monospace', lineHeight: 15 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.shaktiMaroon, paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.md, marginTop: 22 },
  retryBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
