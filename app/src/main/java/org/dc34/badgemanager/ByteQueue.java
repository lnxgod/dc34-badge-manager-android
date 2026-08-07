package org.dc34.badgemanager;

import java.io.ByteArrayOutputStream;
import java.util.ArrayDeque;
import java.util.Arrays;

/** Bounded, thread-safe byte queue between the USB reader and JavaScript poller. */
final class ByteQueue {
    private final ArrayDeque<byte[]> chunks = new ArrayDeque<>();
    private final int capacityBytes;
    private int size;

    ByteQueue(int capacityBytes) {
        if (capacityBytes < 1) throw new IllegalArgumentException("capacityBytes must be positive");
        this.capacityBytes = capacityBytes;
    }

    synchronized void offer(byte[] source) {
        if (source == null || source.length == 0) return;
        byte[] copy = Arrays.copyOf(source, source.length);
        if (copy.length >= capacityBytes) {
            chunks.clear();
            copy = Arrays.copyOfRange(copy, copy.length - capacityBytes, copy.length);
            size = 0;
        }
        while (!chunks.isEmpty() && size + copy.length > capacityBytes) {
            size -= chunks.removeFirst().length;
        }
        chunks.addLast(copy);
        size += copy.length;
    }

    synchronized byte[] drain() {
        if (size == 0) return new byte[0];
        ByteArrayOutputStream output = new ByteArrayOutputStream(size);
        while (!chunks.isEmpty()) {
            byte[] chunk = chunks.removeFirst();
            output.write(chunk, 0, chunk.length);
        }
        size = 0;
        return output.toByteArray();
    }

    synchronized void clear() {
        chunks.clear();
        size = 0;
    }

    synchronized int size() {
        return size;
    }
}
