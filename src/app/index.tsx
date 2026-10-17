import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBottomNav } from '@/components/app-bottom-nav';
import { useMedication } from '@/state/medication-context';

const C = { ink: '#263e48', muted: '#72848a', mint: '#36b7aa', pale: '#eef9fa' };

export default function HomeScreen() {
  const { state: { taken } } = useMedication();
  return <SafeAreaView style={s.safe}><View style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3fafb' }}><Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>くすり日和</Text></View><ScrollView contentContainerStyle={s.content}>
    <Text style={s.kicker}>YOUR DAILY LITTLE PROMISE</Text>
    <Text style={s.title}>{taken ? '今日も、よくできました！' : 'おはよう！\n薬の時間だよ。'}</Text>
    <View style={s.mascot}><Text style={s.bear}>🐻</Text><Text style={s.spark}>✦</Text></View>
    <Text style={s.helper}>“飲んで、今日もいい一日にしよう！”</Text>
    <View style={s.card}><Text style={s.label}>{taken ? '今日の服用（デモ）' : '服用予定（デモ）'}</Text><Text style={s.time}>09:00</Text><Text style={s.medicine}>朝のおくすり　/ 1錠</Text>
      <Pressable style={[s.primary, taken && s.disabled]} disabled={taken} onPress={() => router.push('/qr')}><Text style={s.primaryText}>{taken ? '✓ 服用を記録しました' : '▦  QRを読み取って服用確認'}</Text></Pressable>
      {!taken && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => router.push('/missed')}><Text style={s.secondaryText}>飲めなかった場合（デモ）</Text></Pressable>}
    </View>
    <View style={s.heading}><Text style={s.sectionTitle}>今週の達成状況</Text><Text style={s.muted}>小さな一歩を、毎日。</Text></View>
    <View style={s.week}>{['月','火','水','木','金','土','日'].map((day, i) => <View key={day} style={s.day}><Text style={[s.dot, i < 3 && s.done, i === 3 && taken && s.done]}>{i < 3 || (i === 3 && taken) ? '✓' : '·'}</Text><Text style={s.muted}>{day}</Text></View>)}</View>
  </ScrollView><AppBottomNav /></SafeAreaView>;
}

const s = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f5faf8'},content:{padding:24,paddingBottom:40},kicker:{fontSize:10,letterSpacing:1.5,color:'#5e9696',textAlign:'center',marginTop:8},title:{fontSize:24,lineHeight:36,fontWeight:'700',color:C.ink,textAlign:'center',marginTop:9},mascot:{height:155,alignItems:'center',justifyContent:'center'},bear:{fontSize:105},spark:{position:'absolute',right:40,top:22,fontSize:28,color:'#f7c45f'},helper:{fontSize:11,color:C.muted,textAlign:'center'},card:{backgroundColor:'#fff',borderRadius:20,padding:20,marginTop:18,shadowColor:'#2d5960',shadowOpacity:.06,shadowRadius:10,elevation:2},label:{fontSize:10,color:C.muted,textAlign:'center'},time:{fontSize:40,fontWeight:'700',textAlign:'center',color:C.ink,marginTop:4},medicine:{fontSize:13,textAlign:'center',color:C.ink},primary:{backgroundColor:C.mint,borderRadius:14,padding:14,alignItems:'center',marginTop:18},primaryText:{color:'#fff',fontSize:12,fontWeight:'700'},disabled:{backgroundColor:'#9abeb7'},secondary:{backgroundColor:C.pale,borderRadius:14,padding:12,alignItems:'center',marginTop:9},secondaryText:{color:'#637e81',fontSize:11},heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:24,marginBottom:13},sectionTitle:{fontSize:13,fontWeight:'700',color:C.ink},muted:{fontSize:10,color:C.muted},week:{flexDirection:'row',justifyContent:'space-between'},day:{alignItems:'center',gap:7},dot:{width:26,height:26,borderRadius:13,borderWidth:1,borderColor:'#d8e7e4',textAlign:'center',textAlignVertical:'center',color:'#91c2b7',backgroundColor:'#f6f9f8'},done:{backgroundColor:'#52bead',borderColor:'#52bead',color:'#fff'},streak:{backgroundColor:'#fff',borderRadius:16,padding:15,marginTop:18,flexDirection:'row',alignItems:'center',gap:12},flame:{fontSize:26},streakText:{fontSize:15,fontWeight:'700',color:C.ink} });
