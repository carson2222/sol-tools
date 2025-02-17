import { mplCore } from "@metaplex-foundation/mpl-core";
import { fetchMetadataFromSeeds, unverifyCreatorV1, updateV1 } from "@metaplex-foundation/mpl-token-metadata";
import { verifyCreatorV1 } from "@metaplex-foundation/mpl-token-metadata";
import { createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import bs58 from "bs58";
import dotenv from "dotenv";
dotenv.config();

async function migrateCollection() {
  // Load wallets
  const privateKey = process.env.OLD_UA_SECRET_KEY as string;
  const umi = createUmi(process.env.RPC as string, "confirmed").use(mplCore());
  const signer = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
  umi.use(signerIdentity(createSignerFromKeypair(umi, signer)));

  const privateKeyNew = process.env.NEW_UA_SECRET_KEY as string;
  const umiNew = createUmi(process.env.RPC as string, "confirmed").use(mplCore());
  const signerNew = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKeyNew));
  umiNew.use(signerIdentity(createSignerFromKeypair(umi, signerNew)));

  const mint = publicKey("DmL46V46U5VM4UgrJbVQvWhVyD1zjZGGVRWeMv46eWt9");
  const newAuthority = signerNew.publicKey;
  const newCreators = buildNewCreators([{ address: newAuthority.toString(), share: 100 }]); // Sum of share has to be 100, it a % value

  // Load collection's metadata
  const initialMetadata = await fetchMetadataFromSeeds(umi, {
    mint,
  });
  console.log(initialMetadata);

  if (!initialMetadata.publicKey) throw new Error("The nft does not have a metadata");

  // Unverify old creator
  let tx = await unverifyCreatorV1(umi, {
    metadata: initialMetadata.publicKey,
    authority: umi.identity,
  }).sendAndConfirm(umi);
  if (tx.result.value.err) throw new Error(tx.result.value.err.toString());
  console.log(tx);

  // Update UpdateAuthority and creators values in metadata (you can update other values too)
  tx = await updateV1(umi, {
    mint,
    authority: umi.identity,
    data: { ...initialMetadata, creators: newCreators },
    newUpdateAuthority: newAuthority,
  }).sendAndConfirm(umi);
  if (tx.result.value.err) throw new Error(tx.result.value.err.toString());
  console.log(tx);

  // Verify the new creator
  tx = await verifyCreatorV1(umiNew, {
    metadata: initialMetadata.publicKey,
    authority: umiNew.identity,
  }).sendAndConfirm(umiNew);
  if (tx.result.value.err) throw new Error(tx.result.value.err.toString());
  console.log(tx);

  console.log("Success");
}

migrateCollection().catch((err) => console.error(err));

function buildNewCreators(newCreators: { address: string; share: number }[]) {
  if (newCreators.reduce((prev, creator) => prev + creator.share, 0) !== 100)
    throw new Error("Incorrect new creators: sum of share has to be 100");

  return newCreators.map(({ address, share }) => {
    return { address: publicKey(address), verified: false, share };
  });
}
