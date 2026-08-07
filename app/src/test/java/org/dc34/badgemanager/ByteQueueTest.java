package org.dc34.badgemanager;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class ByteQueueTest {
    @Test public void drainsChunksInOrder() {
        ByteQueue queue = new ByteQueue(16);
        queue.offer(new byte[] { 1, 2 });
        queue.offer(new byte[] { 3, 4 });
        assertEquals(4, queue.size());
        assertArrayEquals(new byte[] { 1, 2, 3, 4 }, queue.drain());
        assertEquals(0, queue.size());
    }

    @Test public void dropsOldestWholeChunksAtCapacity() {
        ByteQueue queue = new ByteQueue(4);
        queue.offer(new byte[] { 1, 2 });
        queue.offer(new byte[] { 3, 4, 5 });
        assertArrayEquals(new byte[] { 3, 4, 5 }, queue.drain());
    }

    @Test public void keepsTailOfSingleOversizedChunk() {
        ByteQueue queue = new ByteQueue(3);
        queue.offer(new byte[] { 1, 2, 3, 4, 5 });
        assertArrayEquals(new byte[] { 3, 4, 5 }, queue.drain());
    }
}
