import { useEffect, useRef, type ComponentType, type Ref } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

// react-native-webview 14's class typings don't resolve under React 19.3 types; narrow to the props we use.
interface WebViewHandle { injectJavaScript: (js: string) => void }
const WebView = RNWebView as unknown as ComponentType<{
  ref?: Ref<WebViewHandle>; originWhitelist: string[]; source: { html: string };
  onMessage: (e: { nativeEvent: { data: string } }) => void; javaScriptEnabled: boolean; setSupportMultipleWindows: boolean;
}>;

/**
 * OpenStreetMap + Leaflet inside a WebView — free, no Google Maps API key.
 * Markers/lines are pushed with postMessage so the map is not reloaded on every update.
 */
export interface MapMarker { id: string; lat: number; lng: number; kind: 'home' | 'truck' | 'stop' | 'done' | 'depot' | 'pin'; label?: string }
export interface MapProps {
  markers: MapMarker[];
  line?: [number, number][]; // [lng, lat] GeoJSON order
  fit?: boolean;
  pickable?: boolean;
  /** change this value to re-centre the map on the first marker (e.g. after "Use GPS") */
  focusKey?: string | number;
  onPick?: (lat: number, lng: number) => void;
  style?: StyleProp<ViewStyle>;
}

const HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{height:100%;margin:0}.p{border:2px solid #fff;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font:600 11px sans-serif}</style>
</head><body><div id="m"></div><script>
var map=L.map('m',{zoomControl:true,attributionControl:true}).setView([-1.9441,30.0619],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var layer=L.layerGroup().addTo(map),line=null,pickable=false,fitted=false,focus=null;
var TRUCK='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
var HOME='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>';
var C={home:'#0F766E',truck:'#D97706',stop:'#475569',done:'#15803D',depot:'#0F766E',pin:'#DC2626'};
function icon(m){var s=m.kind==='truck'?30:m.kind==='home'||m.kind==='pin'?28:22;
 var t=m.kind==='truck'?TRUCK:m.kind==='home'?HOME:m.kind==='depot'?'D':(m.label||'');
 return L.divIcon({className:'',html:'<div class="p" style="width:'+s+'px;height:'+s+'px;background:'+C[m.kind]+'">'+t+'</div>',iconSize:[s,s],iconAnchor:[s/2,s/2]});}
function update(d){layer.clearLayers();var pts=[];
 (d.markers||[]).forEach(function(m){L.marker([m.lat,m.lng],{icon:icon(m)}).addTo(layer);pts.push([m.lat,m.lng]);});
 if(line){map.removeLayer(line);line=null;}
 if(d.line&&d.line.length>1){line=L.polyline(d.line.map(function(c){return [c[1],c[0]]}),{color:'#0D9488',weight:5,opacity:.8}).addTo(map);}
 pickable=!!d.pickable;
 if(d.focusKey!=null&&d.focusKey!==focus&&pts.length){focus=d.focusKey;fitted=true;map.setView(pts[0],17);return;}
 if(d.fit&&pts.length&&!fitted){fitted=true;if(pts.length===1)map.setView(pts[0],16);else map.fitBounds(pts,{padding:[30,30],maxZoom:17});}}
map.on('click',function(e){if(pickable)window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng}));});
document.addEventListener('message',function(e){update(JSON.parse(e.data))});window.addEventListener('message',function(e){update(JSON.parse(e.data))});
window.ReactNativeWebView.postMessage(JSON.stringify({ready:true}));
</script></body></html>`;

export function LeafletMap({ markers, line, fit = true, pickable, focusKey, onPick, style }: MapProps) {
  const ref = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const payload = JSON.stringify({ markers, line, fit, pickable, focusKey });
  const send = () => ref.current?.injectJavaScript(`update(${payload});true;`);
  useEffect(() => { if (ready.current) send(); });
  return (
    <View style={[{ height: 260, borderRadius: 12, overflow: 'hidden' }, style]} accessibilityLabel="Map">
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: HTML }}
        onMessage={(e) => {
          const msg = JSON.parse(e.nativeEvent.data);
          if (msg.ready) { ready.current = true; send(); return; }
          onPick?.(msg.lat, msg.lng);
        }}
        javaScriptEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
