import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { MedicationPlanForm } from '@/components/medication-plan-form';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { getMedicationDatabase } from '@/features/medications/database';
import { loadMedicationPlan } from '@/features/medications/medication-plan-editor';
import type { MedicationPlanInput } from '@/features/medications/medication';

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const medicationId = Number(id);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: number; value?: MedicationPlanInput; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!Number.isSafeInteger(medicationId) || medicationId <= 0) throw new Error('薬を選び直してください。');
        const value = await loadMedicationPlan(await getMedicationDatabase(), medicationId);
        if (active) setResult({ id: medicationId, value });
      } catch (error) {
        if (active) setResult({ id: medicationId, error: error instanceof Error ? error.message : '登録内容を読み込めませんでした。' });
      }
    })();
    return () => { active = false; };
  }, [medicationId, attempt]);
  if (result?.id === medicationId && result.value) return <MedicationPlanForm key={medicationId} medicationId={medicationId} initialValue={result.value} />;
  return <MedicationScreen title="おくすりの情報・編集" description="登録内容を確認しています。" backTo="/medications">
    {result?.id === medicationId && result.error ? <>
      <Text accessibilityRole="alert" style={{ color: C.error }}>{result.error}</Text>
      <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={{ minHeight: 48, justifyContent: 'center' }}><Text>再読み込み</Text></Pressable>
    </> : <ActivityIndicator color={C.mint} />}
  </MedicationScreen>;
}
