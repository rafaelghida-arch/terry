import { Redirect, useLocalSearchParams } from 'expo-router';
import { routeFor } from '../../../navigation';
import { useProject } from '../../../state/store';

export default function ProjectEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProject(id);
  if (!p) return <Redirect href="/" />;
  return <Redirect href={routeFor(p) as never} />;
}
