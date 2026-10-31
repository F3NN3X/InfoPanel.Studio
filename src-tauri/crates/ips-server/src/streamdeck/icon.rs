// A key's icon as the Stream Deck app sends it, made into what a browser shows. LZ4 is raw BGRA (144 x 144 as asked
// for): bytes 0 and 2 of a pixel are swapped to RGBA unless all four are zero (a transparent pixel stays transparent),
// and the result is a PNG. BMP, JPEG and PNG payloads are kept as they are. The version is a short hash of the bytes,
// which the icon URL carries so a browser may cache it for good.

use axum::body::Bytes;
use sha2::{Digest, Sha256};

use super::proto::{self, ImageFormat};

/// The largest icon side read; an LZ4 icon is 144 x 144.
const MAX_SIDE: u32 = 512;

#[derive(Debug, Clone, PartialEq)]
pub struct IconData {
    pub bytes: Bytes,
    pub content_type: &'static str,
    pub version: String,
}

impl IconData {
    fn new(bytes: Vec<u8>, content_type: &'static str) -> Self {
        let version = Sha256::digest(&bytes)
            .iter()
            .take(6)
            .map(|b| format!("{b:02x}"))
            .collect();
        Self {
            bytes: Bytes::from(bytes),
            content_type,
            version,
        }
    }
}

/// BGRA to RGBA in place, leaving fully zero pixels alone.
pub fn bgra_to_rgba(pixels: &mut [u8]) {
    for px in pixels.as_chunks_mut::<4>().0 {
        if *px != [0, 0, 0, 0] {
            px.swap(0, 2);
        }
    }
}

fn encode_png(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(rgba).ok()?;
    writer.finish().ok()?;
    Some(out)
}

/// The icon to serve, or `None` for an empty image or one that can't be read.
pub fn decode(image: &proto::Image) -> Option<IconData> {
    if image.image.is_empty() {
        return None;
    }
    match ImageFormat::try_from(image.format).ok()? {
        ImageFormat::Bmp => Some(IconData::new(image.image.clone(), "image/bmp")),
        ImageFormat::Jpg => Some(IconData::new(image.image.clone(), "image/jpeg")),
        ImageFormat::Png => Some(IconData::new(image.image.clone(), "image/png")),
        ImageFormat::Lz4 => {
            let (width, height) = image
                .size
                .as_ref()
                .map_or((proto::ICON_SIZE, proto::ICON_SIZE), |s| {
                    (s.width, s.height)
                });
            if width == 0 || height == 0 || width > MAX_SIDE || height > MAX_SIDE {
                return None;
            }
            let expected = (width * height * 4) as usize;
            let mut pixels = lz4_flex::block::decompress(&image.image, expected).ok()?;
            if pixels.len() != expected {
                return None;
            }
            bgra_to_rgba(&mut pixels);
            Some(IconData::new(
                encode_png(&pixels, width, height)?,
                "image/png",
            ))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image(format: ImageFormat, size: Option<(u32, u32)>, data: Vec<u8>) -> proto::Image {
        proto::Image {
            format: format as i32,
            r#type: 1,
            size: size.map(|(width, height)| proto::Size { width, height }),
            row_bytes: 0,
            image: data,
        }
    }

    fn read_png(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
        let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
            .read_info()
            .unwrap();
        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();
        buf.truncate(info.buffer_size());
        (info.width, info.height, buf)
    }

    #[test]
    fn swaps_blue_and_red_but_leaves_transparent_pixels_alone() {
        let mut px = vec![1, 2, 3, 4, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 255];
        bgra_to_rgba(&mut px);
        assert_eq!(px, [3, 2, 1, 4, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 255]);
    }

    #[test]
    fn makes_an_lz4_icon_into_an_rgba_png() {
        // 2 x 1: a blue opaque pixel (BGRA 255,0,0,255) and a transparent one.
        let raw = [255, 0, 0, 255, 0, 0, 0, 0];
        let icon = decode(&image(
            ImageFormat::Lz4,
            Some((2, 1)),
            lz4_flex::block::compress(&raw),
        ))
        .unwrap();
        assert_eq!(icon.content_type, "image/png");
        assert_eq!(
            read_png(&icon.bytes),
            (2, 1, vec![0, 0, 255, 255, 0, 0, 0, 0])
        );
        assert_eq!(icon.version.len(), 12);
        // The default size is 144 x 144; the same bytes give the same version, other bytes another one.
        let full = vec![7u8; 144 * 144 * 4];
        let a = decode(&image(
            ImageFormat::Lz4,
            None,
            lz4_flex::block::compress(&full),
        ))
        .unwrap();
        let b = decode(&image(
            ImageFormat::Lz4,
            None,
            lz4_flex::block::compress(&full),
        ))
        .unwrap();
        assert_eq!(read_png(&a.bytes).0, 144);
        assert_eq!(a.version, b.version);
        assert_ne!(a.version, icon.version);
    }

    #[test]
    fn keeps_other_formats_as_sent_and_skips_what_it_cannot_read() {
        let jpeg = decode(&image(ImageFormat::Jpg, None, vec![0xff, 0xd8, 1])).unwrap();
        assert_eq!(
            (jpeg.content_type, &jpeg.bytes[..]),
            ("image/jpeg", &[0xff, 0xd8, 1][..])
        );
        assert_eq!(
            decode(&image(ImageFormat::Bmp, None, vec![1]))
                .unwrap()
                .content_type,
            "image/bmp"
        );
        assert_eq!(
            decode(&image(ImageFormat::Png, None, vec![1]))
                .unwrap()
                .content_type,
            "image/png"
        );
        // Empty, an unread format, a size that doesn't match the pixels, or an absurd size.
        assert_eq!(decode(&image(ImageFormat::Png, None, vec![])), None);
        assert_eq!(decode(&image(ImageFormat::Lzfse, None, vec![1])), None);
        assert_eq!(
            decode(&image(
                ImageFormat::Lz4,
                Some((2, 2)),
                lz4_flex::block::compress(&[1; 8])
            )),
            None
        );
        assert_eq!(
            decode(&image(ImageFormat::Lz4, Some((4096, 4096)), vec![1])),
            None
        );
        assert_eq!(decode(&image(ImageFormat::Lz4, None, vec![0xf0, 1])), None);
    }
}
