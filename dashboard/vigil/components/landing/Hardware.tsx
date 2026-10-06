import { Reveal } from './Reveal'

const ROWS = [
  { fn: 'Controller', sim: 'Cortex-M4F at 48 MHz, scheduler + 12-bit ADC + DMA', real: 'STM32F411 “Black Pill”, FreeRTOS', note: 'FPU makes the FFT cheap' },
  { fn: 'Vibration', sim: 'Analog MEMS accelerometer, 330 mV/g, ADC channel 0', real: 'ADXL1002 or ADXL335 on the bearing housing', note: 'Mount it with a stud, not tape' },
  { fn: 'Temperature', sim: 'Analog RTD amplifier, 10 mV/°C, ADC channel 4', real: 'PT100 + MAX31865, or a DS18B20 clamped to the frame', note: 'Slowest channel, sampled at 10 Hz' },
  { fn: 'Current', sim: 'Hall sensor, ±33 A peak, ADC channel 1', real: 'ACS712-20A or an SCT-013 clamp on one phase', note: 'Needs a clean 1.65 V mid-rail' },
  { fn: 'Speed', sim: 'One pulse per revolution into TIM2 input capture', real: 'A3144 hall sensor and a magnet on the shaft collar', note: 'Also triggers the vibration scope' },
  { fn: 'Alarms', sim: 'Three LEDs, a buzzer and a contactor relay on GPIO', real: 'Stack light, piezo buzzer, 5 V relay driving K1', note: 'Same pins, same logic' },
  { fn: 'Link to a PC or PLC', sim: 'UART2 telemetry + Modbus RTU registers', real: 'USB-UART bridge, or RS-485 transceiver for Modbus', note: 'Frames are CRC-16 protected' },
]

export function Hardware() {
  return (
    <Reveal>
      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-500">
                <th scope="col" className="label px-5 py-3 font-medium">
                  Function
                </th>
                <th scope="col" className="label px-3 py-3 font-medium">
                  In this simulation
                </th>
                <th scope="col" className="label px-3 py-3 font-medium !text-bone">
                  With real parts
                </th>
                <th scope="col" className="label px-3 py-3 font-medium">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.fn} className="border-b border-ink-700/80 align-top last:border-0 hover:bg-ink-700/30">
                  <th scope="row" className="px-5 py-3.5 text-[16px] font-semibold text-bone">
                    {r.fn}
                  </th>
                  <td className="px-3 py-3.5 text-[15px] leading-snug text-steel-200">{r.sim}</td>
                  <td className="px-3 py-3.5 text-[15px] leading-snug text-bone">{r.real}</td>
                  <td className="mono px-3 py-3.5 text-[11px] leading-snug text-steel-300">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Reveal>
  )
}
