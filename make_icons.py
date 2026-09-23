import os, struct, zlib

def png(n, safe):
    r_out, r_in = n * (0.30 if safe else 0.40), n * (0.20 if safe else 0.27)
    r_dot, c = n * 0.08, n / 2
    raw = bytearray()
    for y in range(n):
        raw.append(0)
        for x in range(n):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5
            col = (251, 191, 36) if (r_in < d < r_out or d < r_dot) else (15, 23, 42)
            raw += bytes(col)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))

os.makedirs('icons', exist_ok=True)
open('icons/icon-192.png', 'wb').write(png(192, False))
open('icons/icon-512.png', 'wb').write(png(512, False))
open('icons/icon-192-maskable.png', 'wb').write(png(192, True))
p = png(48, False)
open('favicon.ico', 'wb').write(struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 48, 48, 0, 0, 1, 32, len(p), 22) + p)
print('Icons written.')
