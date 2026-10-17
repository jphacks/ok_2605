import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function ExploreScreen() {
  return <View style={styles.container}><Text style={styles.title}>設定</Text><Text style={styles.body}>通知・ペナルティ・ご褒美の設定はここから追加します。</Text><Link href="/">ホームへ戻る</Link></View>;
}
const styles=StyleSheet.create({container:{flex:1,justifyContent:'center',alignItems:'center',padding:24,gap:14},title:{fontSize:24,fontWeight:'700'},body:{textAlign:'center',color:'#72848a'}});
