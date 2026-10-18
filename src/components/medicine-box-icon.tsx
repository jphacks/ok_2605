import { Image } from 'expo-image';

export function MedicineBoxIcon({ size = 26 }: { size?: number }) {
  return <Image source={require('../../assets/images/navigation/medicine-box.png')} contentFit="contain" style={{ width: size, height: size }} />;
}
