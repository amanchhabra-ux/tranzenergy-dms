export default function handler(req, res) {
  res.status(200).json({ 
    hasToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    storeId: process.env.BLOB_STORE_ID
  });
}
