// 必须在任何 store / 组件模块求值之前导入（main.tsx 第一个 import），
// 保证 window.api 在模块初始化阶段即可用
import { buildApi } from './index'

window.api = buildApi()
