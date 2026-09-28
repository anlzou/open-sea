# 鲸鱼模型使用说明（three.js）

文件：`whale.glb`（约 371 KB，含内嵌 512×512 皮肤纹理 + 96×96 眼球纹理）

## 模型规格
- 低模：604 顶点 / 1024 四边面（导出为 1104 三角面），2 个材质（WhaleSkin 皮肤 + WhaleEye 眼睛）
- 尾叶与胸鳍为翼型剖面放样，与身体平滑过渡；头部有可见眼睛（灰白色眼球 + 深色虹膜，见下）和背部双缝呼吸孔（纹理细节）
- 朝向：模型前方为 **-Y 轴**（与 three.js 默认朝向一致），总长约 4.4 单位，可按需 `scale`
- 蒙皮：骨骼链 `root → spine.01~05 → flukes`，胸鳍骨 `fin.R` / `fin.L`（挂在 spine.02 下），共 9 根关节骨

## 眼睛（本轮重做）
对比图：`whale_eye_before_head.png`（原始全黑眼斑）→ `whale_eye_after_head.png` / `_close.png` / `_side.png`

- 原来的"眼睛"是一个只有 **5 段经线**的扁球，轮廓必然是六边形，而且所有 UV 都堆在 (0,0)，材质只有一个近黑色的纯色 `Base Color`，所以永远只能是黑块。
- 现在把两只眼各替换成 **20 边、3 圈的圆顶眼片**（61 顶点 / 60 面），逐顶点沿体表法线 `ray_cast` 贴合到头部曲面上，中心向外鼓起 16 mm，边缘与皮肤齐平，因此轮廓是正圆。
- 眼片顶点仍然 100% 绑定在 `spine.01`（和原来那颗球一致），所以 `Turn` / `Breach` 等姿态下眼球不会脱离头部（见 `_side.png` 与姿态检查）。
- UV 用**切向坐标系**展开：+u 指向鲸鱼前方、+v 朝上，两只眼共用同一张 96×96 贴图且方向一致，因此"虹膜偏前"这个偏移对两眼同时成立（旧的镜像展开方式做不到）。
- 贴图 `whale_eye_tex`：瞳孔 r<0.10 → 虹膜 r<0.185（带放射纹）→ 巩膜 r<0.36（sRGB 0.60→0.53 灰白，不再是刺眼的 0.80）→ 0.36~0.47 渐变到采样自皮肤贴图的真实肤色 (0.107, 0.141, 0.179)，边缘完全消失。虹膜中心在 (0.545, 0.515)，即**朝嘴的方向偏前**。
- 材质：`Base Color` 接贴图，Roughness 0.20，Metallic 0，Coat 0.25（湿润反光）。

> 程序化节点不会随 glTF 导出，所以眼球全部烘进了一张真实的 96×96 PNG 并打包进 `.blend` / `.glb`，导出后在 three.js 里仍然有效。

## 动画（GLTFLoader 直接读取，共 6 条）
| 剪辑名 | 时长 | 循环 | 说明 |
|---|---|---|---|
| `Swim` | 2.00s | 无缝 | 基础游动：脊柱波动传向尾部，尾叶**上下**摆动（幅度 ±19°，尾尖升降约 1.2 单位），胸鳍同步轻摆 |
| `Turn` | 2.96s | 无缝 | 持续左转：脊柱侧弯 + 身体压坡 + 垂直尾摆；**胸鳍转向**——内侧（左）鳍后收贴体，外侧（右）鳍展开扭转 |
| `FreeSwim` | 5.00s | 无缝 | 空间游动：全身起伏 + 横向摆动 + 俯仰弓身，胸鳍像桨一样划动（抬落 + 扭转） |
| `SceneSwim` | 10.00s | 无缝 | **场景巡游**：鲸鱼沿椭圆航线游过场景，物体位移 + 朝向跟随切线（长轴 16 × 短轴 20），叠加尾摆与鳍摆动 |
| `Breach` | 5.00s | 单次 | **跃出水面**：从水下发力 → 跃起至 z≈+3.1 → 头下摆回落水。水面在 **z = 0**，入水前尾鳍抬出水面 |
| `Cycle` | 20.00s | 无缝 | **剧情循环**：游动 → 跳出水面 → 转向 → 自由游动 → 跳出水面 →（回到开头）。尾拍相位跨段连续，首尾关键帧完全一致 |

### `Cycle` 分段表（24 fps）
| 帧范围 | 段落 | 内容 |
|---|---|---|
| 1 – 48 | 游动 | 平游，尾拍周期 24 帧 |
| 49 – 168 | 跳出水面 | 空中身体僵直、胸鳍张开撑住，尾拍减弱 |
| 169 – 240 | 转向 | 脊柱侧偏 + 压坡，左鳍内收、右鳍撑开 |
| 241 – 360 | 自由游动 | 大幅度起伏与划鳍 |
| 361 – 480 | 跳出水面 | 第二次跃起，略低于第一次 |

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let mixer, actions = {};
new GLTFLoader().load('whale.glb', (gltf) => {
  const whale = gltf.scene;
  whale.scale.setScalar(0.5); // 按需缩放
  scene.add(whale);

  mixer = new THREE.AnimationMixer(whale);
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    actions[clip.name] = action;
  }
  actions['Cycle'].setLoop(THREE.LoopRepeat, Infinity).play(); // 剧情循环
  actions['Cycle'].paused = true;
  actions['Swim'].enabled = true; // 默认播游动
});

// 切换（交叉淡入淡出）
function setAnim(name, fade = 0.4) {
  const cur = Object.values(actions).find(a => a.enabled);
  const next = actions[name];
  if (!next || cur === next) return;
  next.reset().enabled = true;
  next.crossFadeFrom(cur, fade, false);
  next.play();
}

// 单次播放（如 Breach），播完回到游动
function playOnce(name, back = 'Swim') {
  const cur = Object.values(actions).find(a => a.enabled);
  const next = actions[name].reset();
  next.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
  next.enabled = true; next.play();
  next.crossFadeFrom(cur, 0.3, false);
  mixer.addEventListener('finished', function onEnd(e) {
    if (e.action !== next) return;
    mixer.removeEventListener('finished', onEnd);
    setAnim(back);
  });
}

const clock = new THREE.Clock();
function tick() {
  mixer?.update(clock.getDelta());
  requestAnimationFrame(tick);
}
tick();
```

## 提示
- `SceneSwim` / `Breach` 带有**物体位移**（整条模型在场景中移动），如果你要自己控制位置，请改用 `Swim` / `Turn` / `FreeSwim`（它们只有骨骼动画，模型保持在原点）。
- `Breach` 与 `Cycle` 的水面约定为 **z = 0**，平游时机身中心在 z = -0.6（即水面以下约半个身位）。
- `Turn` 只包含身体弯曲/压坡，整体航向旋转建议在代码里对 `whale.rotation.y` 做插值，两者叠加即为自然转弯。
- 纹理源文件：`whale_tex.png`；Blender 工程内位于 `WhaleAsset` 集合，可随时调整后重新导出。

## 在 Blender 里切换动画
`whale.blend` 已清掉导入时自动生成的 NLA 轨道，直接用 **Dope Sheet → Action Editor** 顶部的动作下拉框选择 `Swim / Turn / FreeSwim / SceneSwim / Breach / Cycle` 即可，切换后立即生效、不会互相叠加。

> 若你重新导入 `whale.glb`，glTF 导入器会把 6 条剪辑全部压到 NLA 轨道上同时播放，看起来就像"动画都一样"。解决：选中骨骼 → Outliner 展开其 `NLA Tracks` → 删除轨道，再用 Action Editor 切换。
> 另一个坑：导入生成的骨骼 `rotation_mode` 是 `QUATERNION`，此时对 `rotation_euler` 打的帧动画不会生效（尾鳍/胸鳍不动）。把姿态骨骼的旋转模式改成 `XYZ` 即可。
