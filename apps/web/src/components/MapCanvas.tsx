import { canMoveToken, type Member, type Scene, type Token } from "@mj-ia/shared";
import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import useImage from "use-image";

interface Props {
  scene: Scene;
  tokens: Token[];
  me: Member;
  selectedId: string | null;
  onSelect: (token: Token | null) => void;
  onMove: (tokenId: string, x: number, y: number) => void;
}

/** Les positions des jetons sont en cases de grille (x=0, y=0 : coin haut gauche). */
export function MapCanvas({ scene, tokens, me, selectedId, onSelect, onMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [map] = useImage(scene.mapUrl ?? "", "anonymous");
  const g = scene.gridSize;
  const widthPx = scene.width * g;
  const heightPx = scene.height * g;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const gridLines = useMemo(() => {
    const lines: number[][] = [];
    for (let x = 0; x <= scene.width; x++) lines.push([x * g, 0, x * g, heightPx]);
    for (let y = 0; y <= scene.height; y++) lines.push([0, y * g, widthPx, y * g]);
    return lines;
  }, [scene.width, scene.height, g, widthPx, heightPx]);

  // Zoom à la molette, centré sur le pointeur.
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const old = stage.scaleX();
    const scale = Math.min(4, Math.max(0.2, old * (e.evt.deltaY > 0 ? 0.9 : 1.1)));
    const origin = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
    stage.scale({ x: scale, y: scale });
    stage.position({ x: pointer.x - origin.x * scale, y: pointer.y - origin.y * scale });
  };

  return (
    <div ref={containerRef} className="map">
      <Stage
        width={size.width}
        height={size.height}
        draggable
        onWheel={handleWheel}
        onMouseDown={(e) => e.target === e.target.getStage() && onSelect(null)}
      >
        <Layer listening={false}>
          <Rect width={widthPx} height={heightPx} fill="#2b2b36" />
          {map && <KImage image={map} width={widthPx} height={heightPx} />}
          {gridLines.map((points, i) => (
            <Line key={i} points={points} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          ))}
        </Layer>
        <Layer>
          {tokens.map((token) => (
            <TokenShape
              key={token.id}
              token={token}
              grid={g}
              selected={token.id === selectedId}
              draggable={canMoveToken(token, me)}
              isGm={me.role === "gm"}
              onSelect={() => onSelect(token)}
              onMove={(x, y) => onMove(token.id, x, y)}
              bounds={{ width: scene.width, height: scene.height }}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

function TokenShape(props: {
  token: Token;
  grid: number;
  selected: boolean;
  draggable: boolean;
  isGm: boolean;
  bounds: { width: number; height: number };
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const { token, grid, selected, draggable, isGm, bounds } = props;
  const [image] = useImage(token.imageUrl ?? "", "anonymous");
  const px = token.size * grid;
  const groupRef = useRef<Konva.Group>(null);

  // Remet le jeton à sa position officielle si le serveur la change.
  useEffect(() => {
    groupRef.current?.position({ x: token.x * grid, y: token.y * grid });
  }, [token.x, token.y, grid]);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const clamp = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max - token.size));
    const x = clamp(Math.round(e.target.x() / grid), bounds.width);
    const y = clamp(Math.round(e.target.y() / grid), bounds.height);
    e.target.position({ x: x * grid, y: y * grid });
    props.onMove(x, y);
  };

  return (
    <Group
      ref={groupRef}
      x={token.x * grid}
      y={token.y * grid}
      draggable={draggable}
      onDragStart={(e) => (e.cancelBubble = true)}
      onDragMove={(e) => (e.cancelBubble = true)}
      onDragEnd={handleDragEnd}
      onClick={props.onSelect}
      onTap={props.onSelect}
      opacity={token.hidden && isGm ? 0.5 : 1}
    >
      <Circle
        x={px / 2}
        y={px / 2}
        radius={px / 2 - 3}
        fill={token.color}
        stroke={selected ? "#f1c40f" : "#111"}
        strokeWidth={selected ? 4 : 2}
      />
      {image && (
        <KImage
          image={image}
          x={4}
          y={4}
          width={px - 8}
          height={px - 8}
          cornerRadius={(px - 8) / 2}
        />
      )}
      <Text
        text={token.name}
        y={px + 2}
        width={px}
        align="center"
        fontSize={12}
        fill="#fff"
        shadowColor="#000"
        shadowBlur={3}
      />
    </Group>
  );
}
