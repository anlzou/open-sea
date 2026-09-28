# 鱼模型动画说明（three.js）

## 文件
| 文件 | 说明 |
|---|---|
| `fish_.glb` | **最终交付**：带纹理 + 骨骼 + 3 条动画（501 KB，2674 顶点，每顶点最多 4 个骨骼影响） |

## 制作流程
1. 导入 `fish.glb`，把网格烘焙成 **机头 -Y、背 +Z**（与 `whale_assets/whale.glb` 同一套朝向约定），保存为 `fish.blend`。
2. 重新加载 `fish.blend`，在里面向导式建骨架 + 程序化蒙皮，关键帧动画。
3. 导出 GLB（`export_animation_mode='ACTIONS'`，剪辑名保持原样）。

## 骨架（8 根，全部参与蒙皮）
```
root                                  y -0.90 → -0.76   静止基准骨，扛住整个头部
├─ spine.02   y -0.76 → -0.20   鳃后/胸段
│  ├─ spine.03   y -0.20 → -0.02
│  │  ├─ spine.04   y -0.02 → +0.14
│  │  │  ├─ spine.05   y +0.14 → +0.28   尾柄
│  │  │  │  └─ tail      y +0.28 → +0.70   叉形尾鳍
├─ fin.L   head (+0.069,-0.402,-0.168) → tail (+0.143,-0.236,-0.127)   左胸鳍
└─ fin.R   镜像
```
骨骼轴向（与鲸鱼一致，脊柱沿 +Y）：**rot Z = 左右偏航**、rot Y = 翻滚、rot X = 俯仰。
胸鳍骨沿鳍展方向（不是沿身体），所以 **rot X = 抬落（划水）**、rot Z = 内外扫、rot Y = 沿鳍面扭转。

## 动画（24 fps，48 帧 = 2.00s，全部无缝循环）
| 剪辑 | 内容 |
|---|---|
| `Swim` | 鱼类典型的**水平**波动：偏航波从鳃后传向尾部（3°→15.5° 递增，相位滞后 0.62 rad/节），胸鳍做 40° 划水（rot X 在 -30°…+10°）叠加 24° 内外扫（rot Z 在 -22°…+2°），鳍尖合成行程 **0.233 m** |
| `TurnLeft` | 向左转：全身叠加同向偏航偏置形成 C 形弯曲，摆幅降到 0.6 倍；**内侧（左）胸鳍多张开 8° 当舵、外侧收 3°**，鳍尖行程 0.140 m |
| `TurnRight` | 与 `TurnLeft` 完全镜像，鳍尖行程 0.148 m |

> 鱼和鲸不同：鲸尾是**上下**摆，鱼是**左右**摆，所以这里用的是偏航（rot Z）波而不是俯仰波。

## 关于鱼鳍（两个坑，已解决）
1. **胸鳍绝不能影响身体**。原方案把胸鳍权重混进身体网格，摆动时把侧线拉成一片膜。现在身体顶点完全不带胸鳍权重，胸鳍是独立的刚性壳。
2. **鳍根必须贴在腹侧曲面上**。网格由 60 个独立壳组成，鳍是一片平板、身体是曲面，直接摆必穿模。做法：
   - 把鳍的最内圈顶点逐点投影到腹侧表面并内嵌 1.8 mm（`fish_seat.py`），中段按距离混合、外段保持原形；
   - 内圈顶点权重改成「离它最近的身体顶点的蒙皮权重」与 `fin.L/R` 混合（`fish_rootblend2.py`，混合带 d=32→85 mm），附着处跟着鱼身走，叶片自由划水；
   - 叶片（d>55 mm）整体外移 9 mm 留出间隙；
   - 胸鳍骨从 `spine.02` 改挂到 `root`（`fish_reparent.py`），否则咽喉段的偏航会整片把鳍推进肚子里；
   - 最后**扫角度数包络**（`fish_env.py`）：rotX ∈ [-30°,+10°]、rotZ ∈ [-25°,+5°] 实测零穿模，动画只在这个带里取值。
   逐帧检测结果：`Swim` 最坏陷入 5.3 mm（3/184 顶点），`TurnLeft`/`TurnRight` **0 顶点穿模**，根部开缝 ≤ 8 mm。

> 嘴部动画已按需求放弃：下颚在源网格里是一片敞口的薄板，绕骨骼转动会露出「飘带」，不做比做坏好。头部因此保持刚性（`root` 扛住，形变 0.000）。

## three.js 用法
```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let mixer, actions = {};
new GLTFLoader().load('fish_animated.glb', (gltf) => {
  const fish = gltf.scene;
  fish.rotation.y = Math.PI;   // 模型机头在 glTF +Z，按 three.js 惯例（朝 -Z）需要转 180°
  scene.add(fish);

  mixer = new THREE.AnimationMixer(fish);
  gltf.animations.forEach(c => {
    const a = mixer.clipAction(c);
    a.play(); a.paused = true; actions[c.name] = a;
  });
  actions['Swim'].enabled = true;
});

function setAnim(name, fade = 0.3) {
  const cur = Object.values(actions).find(a => a.enabled);
  const next = actions[name];
  if (!next || cur === next) return;
  next.reset().enabled = true;
  next.crossFadeFrom(cur, fade, false);
  next.play();
}
// 左转 -> setAnim('TurnLeft')，右转 -> setAnim('TurnRight')，回正 -> setAnim('Swim')
```
三条剪辑都只有骨骼动画、**不含物体位移**，前进/转向的航向请在自己的代码里改 `fish.rotation.y`，与剪辑里的身体弯曲叠加即为自然转弯。

## 预览图
| 文件 | 内容 |
|---|---|
| `fishview_*.png` | 原始模型五视图（未加骨架时的样子） |
| `fish_hero_side.png` | 侧面全身，`Swim` 第 13 帧 |
| `fish_swim_top.png` / `fish_turnleft_top.png` / `fish_turnright_top.png` | 俯视图，三条剪辑各一张 |
| `fish_fin_f05/11/17/23.png` | 胸鳍特写，`Swim` 一个划水周期内的 4 个相位 |
| `fish_fin_turnL.png` | 胸鳍特写，`TurnLeft` 第 13 帧（内侧鳍张开当舵） |
