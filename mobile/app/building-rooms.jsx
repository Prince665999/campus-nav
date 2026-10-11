import { ScrollView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { BuildingRooms } from '@/components/BuildingRooms';
import { COLORS, SPACING } from '@/constants/theme';

export default function BuildingRoomsScreen() {
  const { name } = useLocalSearchParams();
  return (
    <>
      <Stack.Screen options={{ title: String(name || 'Rooms') }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={{ padding: SPACING.md }}
      >
        <BuildingRooms
          buildingName={String(name)}
          onOpenRoom={(room) => router.push(`/place/${room.id}`)}
        />
      </ScrollView>
    </>
  );
}