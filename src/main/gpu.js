import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function probeGpu() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw',
      '--format=csv,noheader,nounits',
    ], { timeout: 1500 });
    const line = stdout.trim().split(/\r?\n/)[0];
    if (!line) throw new Error('No NVIDIA GPU data');
    const [name, util, memUsed, memTotal, temp, power] = line.split(',').map((item) => item.trim());
    return {
      available: true,
      vendor: 'NVIDIA',
      name,
      utilization: Number(util),
      memoryUsedMb: Number(memUsed),
      memoryTotalMb: Number(memTotal),
      temperatureC: Number(temp),
      powerW: Number(power),
      source: 'nvidia-smi',
    };
  } catch {
    return {
      available: false,
      vendor: 'Unknown',
      name: '未检测到 NVIDIA GPU',
      utilization: 0,
      memoryUsedMb: 0,
      memoryTotalMb: 0,
      temperatureC: 0,
      powerW: 0,
      source: 'reserved',
    };
  }
}
