import { useEffect, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, ReduceMotion } from 'react-native-reanimated';
import { AlertTriangle, Inbox, WifiOff, type LucideIcon } from 'lucide-react-native';
import { font, radius, space, useColors } from '../lib/theme';

export const ENTER = (i = 0) => FadeInDown.duration(320).delay(i * 40).reduceMotion(ReduceMotion.System);

type Variant = 'body' | 'small' | 'caption' | 'title' | 'h1' | 'label' | 'mono';
const sizes: Record<Variant, TextStyle> = {
  h1: { fontSize: 26, lineHeight: 32, fontFamily: font.bold },
  title: { fontSize: 18, lineHeight: 24, fontFamily: font.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: font.regular },
  label: { fontSize: 15, lineHeight: 20, fontFamily: font.medium },
  small: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: font.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  mono: { fontSize: 16, lineHeight: 22, fontFamily: font.mono },
};
export function Text({ variant = 'body', muted, color, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const c = useColors();
  return <RNText {...rest} style={[sizes[variant], { color: color ?? (muted ? c.mutedFg : c.fg) }, style]} />;
}

export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, edges = ['top'] }: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; edges?: ('top' | 'bottom')[];
}) {
  const c = useColors();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ padding: padded ? space.md : 0, gap: space.md, paddingBottom: space.xl }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >{children}</ScrollView>
  ) : <View style={{ flex: 1, padding: padded ? space.md : 0 }}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      {body}
    </SafeAreaView>
  );
}

export function OfflineBanner({ text = 'You are offline. Changes will sync when the network returns.' }: { text?: string }) {
  const c = useColors();
  const net = useNetworkState();
  if (net.isInternetReachable !== false) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.warningSoft, paddingHorizontal: space.md, paddingVertical: 8 }}>
      <WifiOff size={16} color={c.warning} />
      <Text variant="small" color={c.warning} style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
export function Button({ title, onPress, variant = 'primary', icon: Icon, loading, disabled, style, haptic = true, accessibilityLabel, ...rest }:
  Omit<PressableProps, 'style'> & { title: string; variant?: BtnVariant; icon?: LucideIcon; loading?: boolean; style?: StyleProp<ViewStyle>; haptic?: boolean }) {
  const c = useColors();
  const bg = { primary: c.primaryStrong, secondary: c.card, accent: c.accent, danger: c.danger, ghost: 'transparent' }[variant];
  const fg = { primary: c.onPrimary, secondary: c.fg, accent: c.onAccent, danger: '#FFFFFF', ghost: c.primaryStrong }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => { if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(e); }}
      android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === 'secondary' ? 1 : 0, borderColor: c.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={20} color={fg} /> : null}
      {/* Without an icon the label fills the button: Android sometimes measures Fira Medium text a few px
          short, which wrapped the last word out of view ("Sign out" → "Sign"). */}
      <Text variant="label" color={fg} style={!Icon && !loading ? { flex: 1, textAlign: 'center' } : undefined}>{title}</Text>
    </Pressable>
  );
}

/** `grow` makes the card share a Row equally with its siblings (equal width and height). */
export function Card({ children, style, index, onPress, accessibilityLabel, grow }: { children: ReactNode; style?: StyleProp<ViewStyle>; index?: number; onPress?: () => void; accessibilityLabel?: string; grow?: boolean }) {
  const c = useColors();
  const g = grow ? { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 } : null;
  const inner = <View style={[{ backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: space.md, gap: space.sm }, g, style]}>{children}</View>;
  const content = onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }, g]}>{inner}</Pressable>
    : inner;
  return index == null ? content : <Animated.View entering={ENTER(index)} style={g}>{content}</Animated.View>;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';
export function Badge({ label, tone = 'neutral', icon: Icon }: { label: string; tone?: Tone; icon?: LucideIcon }) {
  const c = useColors();
  const map = { neutral: [c.muted, c.mutedFg], success: [c.successSoft, c.success], warning: [c.warningSoft, c.warning], danger: [c.dangerSoft, c.danger], primary: [c.primarySoft, c.primaryStrong] }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: map[0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      {Icon && <Icon size={14} color={map[1]} />}
      <Text variant="small" color={map[1]} style={{ fontFamily: font.medium }}>{label}</Text>
    </View>
  );
}

export function Field({ label, error, hint, ...input }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="label">{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.mutedFg}
        style={[styles.input, { borderColor: error ? c.danger : c.border, color: c.fg, backgroundColor: c.card }, input.multiline && { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }]}
      />
      {error ? <Text variant="small" color={c.danger} accessibilityRole="alert">{error}</Text> : hint ? <Text variant="small" muted>{hint}</Text> : null}
    </View>
  );
}

export function Chips<T extends string>({ value, onChange, options, label }: { value: T | null; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { void Haptics.selectionAsync(); onChange(o.value); }}
              style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card }}>
              <Text variant="label" color={on ? c.primaryStrong : c.fg}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Skeleton({ height = 72 }: { height?: number }) {
  const c = useColors();
  const o = useSharedValue(0.5);
  useEffect(() => { o.value = withRepeat(withTiming(1, { duration: 700, reduceMotion: ReduceMotion.System }), -1, true); }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityLabel="Loading" style={[{ height, borderRadius: radius.md, backgroundColor: c.muted }, st]} />;
}

export function EmptyState({ title, text, icon: Icon = Inbox, action }: { title: string; text?: string; icon?: LucideIcon; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: space.xl }}>
      <Icon size={36} color={c.mutedFg} />
      <Text variant="title" style={{ textAlign: 'center' }}>{title}</Text>
      {text && <Text muted style={{ textAlign: 'center' }}>{text}</Text>}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 8, padding: space.lg, backgroundColor: c.dangerSoft, borderRadius: radius.md }}>
      <AlertTriangle size={28} color={c.danger} />
      <Text variant="label">Something went wrong</Text>
      <Text variant="small" muted style={{ textAlign: 'center' }}>{error instanceof Error ? error.message : 'Unknown error'}</Text>
      {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

/** loading → skeleton, error → retry, otherwise children */
export function QueryState<T>({ query, children, skeletons = 2 }: { query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (d: T) => ReactNode; skeletons?: number }) {
  if (query.isLoading) return <View style={{ gap: space.md }}>{Array.from({ length: skeletons }, (_, i) => <Skeleton key={i} />)}</View>;
  if (query.error && query.data === undefined) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  // a disabled query (e.g. while signing out) is neither loading nor failed but has no data
  if (query.data === undefined) return <View style={{ gap: space.md }}>{Array.from({ length: skeletons }, (_, i) => <Skeleton key={i} />)}</View>;
  return <>{children(query.data)}</>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
}

export function IconCircle({ icon: Icon, color, bg, size = 44 }: { icon: LucideIcon; color: string; bg: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon size={size * 0.5} color={color} /></View>;
}

const styles = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, fontFamily: font.regular },
});
