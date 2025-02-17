import { mplCore } from "@metaplex-foundation/mpl-core";
import * as MplTM from "@metaplex-foundation/mpl-token-metadata";
import { createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import bs58 from "bs58";
import dotenv from "dotenv";
dotenv.config();

async function migrateCollectionItems() {
  const privateKey = process.env.OLD_UA_SECRET_KEY as string;
  const umi = createUmi(process.env.RPC as string, "confirmed").use(mplCore());
  const signer = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
  umi.use(signerIdentity(createSignerFromKeypair(umi, signer)));

  const privateKeyNew = process.env.NEW_UA_SECRET_KEY as string;
  const umiNew = createUmi(process.env.RPC as string, "confirmed").use(mplCore());
  const signerNew = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKeyNew));
  umiNew.use(signerIdentity(createSignerFromKeypair(umi, signerNew)));

  const collectionMint = publicKey("DmL46V46U5VM4UgrJbVQvWhVyD1zjZGGVRWeMv46eWt9");
  const newAuthority = publicKey("4fNQiDzavD34eNne1BtA5jurXpVmvHgB6GL5JypQ9Dva");
  const newCreators = buildNewCreators([{ address: newAuthority.toString(), share: 100 }]);

  const assets = await MplTM.fetchAllDigitalAssetByOwner(umi, signer.publicKey);
  const filteredAssets = assets.filter((el) => el.metadata.symbol === "ReSHAPE" && el.publicKey != collectionMint);

  for (let i = 0; i < filteredAssets.length; i++) {
    const item = filteredAssets[i];
    console.log(`Handling i: ${i}, Name: ${item.metadata.name}, mint: ${item.publicKey}`);

    // Unverify the Creator
    console.log("Unverifying the old UA from creators");
    const unverifyTx = await MplTM.unverifyCreatorV1(umi, {
      metadata: item.metadata.publicKey,
      authority: umi.identity,
    }).sendAndConfirm(umi);

    if (unverifyTx.result.value.err) throw new Error(unverifyTx.result.value.err.toString());
    console.log("Success: ", unverifyTx);

    const initialMetadata = await MplTM.fetchMetadataFromSeeds(umi, {
      mint: item.publicKey,
    });

    // Update the UA & Creators
    console.log("Updating the UA and creators metadata");
    const updateMetaTx = await MplTM.updateV1(umi, {
      mint: item.publicKey,
      authority: umi.identity,
      data: { ...initialMetadata, creators: newCreators },
      newUpdateAuthority: newAuthority,
    }).sendAndConfirm(umi);

    if (updateMetaTx.result.value.err) throw new Error(updateMetaTx.result.value.err.toString());
    console.log("Success: ", updateMetaTx);

    // Verifying the creator
    console.log("Verifying the new creator");
    const verifyTx = await MplTM.verifyCreatorV1(umiNew, {
      metadata: item.metadata.publicKey,
      authority: umiNew.identity,
    }).sendAndConfirm(umiNew);

    if (verifyTx.result.value.err) throw new Error(verifyTx.result.value.err.toString());
    console.log("Success: ", verifyTx);
  }
}
migrateCollectionItems();

function buildNewCreators(newCreators: { address: string; share: number }[]) {
  if (newCreators.reduce((prev, creator) => prev + creator.share, 0) !== 100)
    throw new Error("Incorrect new creators: sum of share has to be 100");

  return newCreators.map(({ address, share }) => {
    return { address: publicKey(address), verified: false, share };
  });
}
