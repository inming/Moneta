import * as http from 'http'

// 从环境变量读取端口，默认为 9615
const MCP_HTTP_PORT = process.env.MONETA_MCP_PORT 
  ? parseInt(process.env.MONETA_MCP_PORT, 10) 
  : 9615

/**
 * MCP Server HTTP 客户端
 * 用于向 Moneta 主应用查询数据
 */
export async function queryMainApp(path: string, data?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : ''
    
    const options = {
      hostname: '127.0.0.1',
      port: MCP_HTTP_PORT,
      path,
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      },
      timeout: 5000
    }

    const req = http.request(options, (res) => {
      let responseData = ''
      res.on('data', (chunk) => { responseData += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData)
          if (res.statusCode === 200) {
            resolve(parsed)
          } else {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`))
          }
        } catch {
          resolve(responseData)
        }
      })
    })

    req.on('error', (err) => {
      reject(new Error(`无法连接到 Moneta 主应用: ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('连接 Moneta 主应用超时'))
    })

    if (data) {
      req.write(postData)
    }
    req.end()
  })
}
