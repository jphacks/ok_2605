import { Stack } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';

const HANDLE_SIZE = 62;
const TRACK_PADDING = 5;
const COMPLETE_THRESHOLD = 0.78;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

type MedicationChargeConsentProps = {
  medicationName: string;
  penaltyAmount: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MedicationChargeConsent({ medicationName, penaltyAmount, busy = false, onConfirm, onCancel }: MedicationChargeConsentProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [drag] = useState(() => new Animated.Value(0));
  const dragPosition = useRef(0);
  const dragStart = useRef(0);
  const touchStart = useRef(0);
  const [completed, setCompleted] = useState(false);
  const maxDistance = Math.max(trackWidth - HANDLE_SIZE - TRACK_PADDING * 2, 0);

  const animateToStart = useCallback(() => {
    Animated.spring(drag, {
      toValue: 0,
      stiffness: 250,
      damping: 25,
      mass: 0.8,
      useNativeDriver: false,
    }).start();
  }, [drag]);

  const complete = useCallback(() => {
    if (completed || maxDistance <= 0) return;
    setCompleted(true);
    Animated.timing(drag, {
      toValue: maxDistance,
      duration: 180,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onConfirm();
      else setCompleted(false);
    });
  }, [completed, drag, maxDistance, onConfirm]);

  const beginDrag = (event: GestureResponderEvent) => {
    touchStart.current = event.nativeEvent.pageX;
    drag.stopAnimation((value) => {
      dragStart.current = value;
      dragPosition.current = value;
    });
  };

  const moveDrag = (event: GestureResponderEvent) => {
    const next = clamp(dragStart.current + event.nativeEvent.pageX - touchStart.current, 0, maxDistance);
    dragPosition.current = next;
    drag.setValue(next);
  };

  const endDrag = () => {
    if (dragPosition.current >= maxDistance * COMPLETE_THRESHOLD) complete();
    else animateToStart();
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setTrackWidth(width);
    drag.setValue(0);
    dragPosition.current = 0;
    dragStart.current = 0;
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') complete();
  };

  const instructionOpacity = maxDistance > 0
    ? drag.interpolate({ inputRange: [0, maxDistance * 0.65], outputRange: [1, 0], extrapolate: 'clamp' })
    : 1;

  const slider = (
    <View style={styles.footerContent}>
      <Text style={styles.sliderCaption}>内容を理解したら、右へスライド</Text>
      <View onLayout={handleLayout} style={styles.track}>
        <Animated.Text
          pointerEvents="none"
          style={[styles.sliderText, { opacity: instructionOpacity }]}>同意して登録へ進む</Animated.Text>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel="課金について同意して薬の登録へ進む"
          accessibilityHint="右へスライドします。読み上げ機能ではダブルタップでも実行できます。"
          accessibilityActions={[{ name: 'activate', label: '同意して登録へ進む' }]}
          onAccessibilityAction={handleAccessibilityAction}
          onStartShouldSetResponder={() => !completed && !busy}
          onMoveShouldSetResponder={() => !completed && !busy}
          onResponderGrant={beginDrag}
          onResponderMove={moveDrag}
          onResponderRelease={endDrag}
          onResponderTerminate={animateToStart}
          onResponderTerminationRequest={() => false}
          style={[styles.handle, { transform: [{ translateX: drag }] }]}>
          <Text style={styles.handleArrow}>››</Text>
        </Animated.View>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onCancel} style={[styles.cancelButton, busy && styles.disabled]}>
        <Text style={styles.cancelText}>入力内容に戻る</Text>
      </Pressable>
    </View>
  );

  return (
    <MedicationScreen
      title="登録前の確認"
      description="大切な内容です。最後まで確認してからお進みください。"
      backTo="/medications"
      busy={busy}
      onBack={onCancel}
      footer={slider}>
      <Stack.Screen options={{ gestureEnabled: false }} />

      <View style={styles.hero}>
        <View style={styles.iconCircle} accessibilityElementsHidden>
          <Text style={styles.icon}>¥</Text>
        </View>
        <Text accessibilityRole="header" style={styles.heading}>本当に課金されますが、よろしいですか？</Text>
        <Text style={styles.lead}>
          「{medicationName.trim()}」を飲み忘れた場合、1回につき{Number(penaltyAmount).toLocaleString('ja-JP')}円が課金されます。
        </Text>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.check}>✓</Text>
          <View style={styles.detailCopy}>
            <Text style={styles.detailTitle}>登録だけでは課金されません</Text>
            <Text style={styles.detailText}>設定した服用予定を過ぎ、猶予時間内に服用を確認できなかった場合が対象です。</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailRow}>
          <Text style={styles.check}>✓</Text>
          <View style={styles.detailCopy}>
            <Text style={styles.detailTitle}>金額は次の画面で確認できます</Text>
            <Text style={styles.detailText}>ペナルティ金額と服用時刻を確認してから、薬を登録します。</Text>
          </View>
        </View>
      </View>

      <View style={styles.demoNotice}>
        <Text style={styles.demoLabel}>現在はテスト決済です</Text>
        <Text style={styles.demoText}>このビルドでは実際の請求は発生しません。</Text>
      </View>
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 14, paddingVertical: 10 },
  iconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#fff0e6', alignItems: 'center', justifyContent: 'center' },
  icon: { color: '#e45d55', fontSize: 32, fontWeight: '800' },
  heading: { maxWidth: 310, color: C.ink, fontSize: 24, lineHeight: 35, fontWeight: '800', textAlign: 'center' },
  lead: { color: C.muted, fontSize: 14, lineHeight: 24, textAlign: 'center' },
  details: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 18, gap: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  check: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: C.pale, color: C.mint, textAlign: 'center', lineHeight: 24, fontSize: 13, fontWeight: '800' },
  detailCopy: { flex: 1, gap: 4 },
  detailTitle: { color: C.ink, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  detailText: { color: C.muted, fontSize: 12, lineHeight: 20 },
  divider: { height: 1, backgroundColor: C.line },
  demoNotice: { backgroundColor: '#fff8e8', borderRadius: 14, padding: 14, gap: 4 },
  demoLabel: { color: '#8a5a12', fontSize: 12, fontWeight: '700' },
  demoText: { color: '#8a6b3d', fontSize: 12, lineHeight: 19 },
  footerContent: { gap: 6 },
  sliderCaption: { color: C.muted, fontSize: 12, textAlign: 'center', marginBottom: 10 },
  track: { height: 72, borderRadius: 36, backgroundColor: '#2d414c', padding: TRACK_PADDING, justifyContent: 'center', overflow: 'hidden' },
  sliderText: { position: 'absolute', left: HANDLE_SIZE + 8, right: 20, color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  handle: { width: HANDLE_SIZE, height: HANDLE_SIZE, borderRadius: HANDLE_SIZE / 2, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  handleArrow: { color: '#fff', fontSize: 27, lineHeight: 30, fontWeight: '700', letterSpacing: -4, paddingRight: 4 },
  cancelButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
