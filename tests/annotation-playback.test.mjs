import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ref, computed } from 'vue';

test('collapsed annotations appear on playback for five seconds, replay, and reset after seeking', () => {
  const props = { record: { annotations: [
    { id: 'a', timeMs: 1000, createdAt: '1' },
    { id: 'b', timeMs: 1000, createdAt: '2' },
    { id: 'c', timeMs: 10000, createdAt: '3' },
  ] } };
  let exposed;
  const timers = new Map(); let sequence = 0;
  const context = vm.createContext({ ref, computed, nextTick: async () => {}, onBeforeUnmount: () => {},
    defineProps: () => props, defineEmits: () => () => {}, defineExpose: value => { exposed = value; },
    setTimeout: (callback, ms) => { assert.equal(ms, 5000); timers.set(++sequence, callback); return sequence; },
    clearTimeout: id => timers.delete(id),
  });
  const source = fs.readFileSync('src/components/VideoAnnotations.vue', 'utf8').split('<script setup>')[1].split('</script>')[0].replace(/^import .*;$/gm, '');
  vm.runInContext(source, context);
  const visible = () => Array.from(vm.runInContext('visibleItems.value.map(item => item.id)', context));
  assert.deepEqual(visible(), []);
  exposed.playback(0.8); exposed.playback(1.1);
  assert.deepEqual(visible(), ['a', 'b']);
  for (const callback of [...timers.values()]) callback();
  assert.deepEqual(visible(), []);
  exposed.playback(1.2);
  assert.deepEqual(visible(), []);
  exposed.resetPlayback(); exposed.playback(0.9); exposed.playback(1.1);
  assert.deepEqual(visible(), ['a', 'b']);
  exposed.resetPlayback(); exposed.playback(20);
  assert.deepEqual(visible(), []);
  exposed.resetPlayback(); exposed.playback(10);
  assert.deepEqual(visible(), ['c']);
  vm.runInContext('expanded.value = true', context);
  assert.deepEqual(visible(), ['a', 'b', 'c']);
});
