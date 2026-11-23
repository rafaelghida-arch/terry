import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Clip, Scene } from '../domain/types';
import { Button, Chip, Sheet } from './kit';
import { C, R, T } from './theme';

export function SceneEditSheet({ scene, visible, onClose, onSave }: {
  scene: Scene | undefined;
  visible: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Scene>) => void;
}) {
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [audio, setAudio] = useState('');
  const [line, setLine] = useState('');
  const [duration, setDuration] = useState(3);

  useEffect(() => {
    if (!scene || !visible) return;
    setTitle(scene.title);
    setInstruction(scene.instruction);
    setAudio(scene.audio);
    setLine(scene.line ?? '');
    setDuration(scene.duration);
  }, [scene?.id, visible]);

  if (!scene) return null;
  const openLine = scene.role === 'mordida' || scene.role === 'reacao';
  return (
    <Sheet visible={visible} onClose={onClose} title="Editar tomada">
      <View style={{ gap: 12 }}>
        <Field label="Título" value={title} onChange={setTitle} />
        <Field label="O que filmar" value={instruction} onChange={setInstruction} multiline />
        <Field label="Som / fala" value={audio} onChange={setAudio} multiline />
        {openLine ? (
          <Text style={T.small}>Essa tomada fica sem fala escrita. A reação é sua, na hora.</Text>
        ) : (
          <Field label="Fala sugerida (opcional)" value={line} onChange={setLine} multiline />
        )}
        <Text style={T.tiny}>DURAÇÃO SUGERIDA</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[2, 3, 4, 5, 6, 8, 10].map((d) => (
            <Chip key={d} label={`${d}s`} selected={duration === d} onPress={() => setDuration(d)} />
          ))}
        </View>
        <Button
          label="Salvar"
          onPress={() => {
            onSave({ title: title.trim() || scene.title, instruction: instruction.trim(), audio: audio.trim(), line: openLine ? undefined : line.trim() || undefined, duration });
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={T.tiny}>{label.toUpperCase()}</Text>
      <TextInput value={value} onChangeText={onChange} multiline={multiline} style={[st.input, multiline && { minHeight: 64 }]} placeholderTextColor={C.mute} />
    </View>
  );
}

export function ClipPlayerSheet({ clip, visible, onClose }: { clip: Clip | undefined; visible: boolean; onClose: () => void }) {
  const player = useVideoPlayer(clip?.uri ?? null, (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (visible && clip) {
      player.currentTime = clip.trimStart;
      player.play();
    } else player.pause();
  }, [visible, clip?.id]);
  if (!clip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Clipe gravado">
      <View style={[st.video, clip.height >= clip.width ? { height: 400, width: 400 * (clip.width / clip.height || 9 / 16) } : { width: '100%', aspectRatio: clip.width / clip.height }]}>
        <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls />
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  input: { backgroundColor: C.surface2, borderRadius: R.m, color: C.text, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  video: { alignSelf: 'center', maxWidth: '100%', backgroundColor: '#000', borderRadius: R.m, overflow: 'hidden' },
});
