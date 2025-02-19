import bs58 from "bs58";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import dotenv from "dotenv";
import { AuthorityType, setAuthority } from "@metaplex-foundation/mpl-toolbox";
import { fetchAllDigitalAssetByUpdateAuthority, fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
dotenv.config();

async function migrateSFTsAuthoritites() {
  const privateKey = process.env.OLD_UA_SECRET_KEY as string;
  const umi = createUmi(process.env.RPC as string, "confirmed").use(mplCore());
  const signer = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKey));
  umi.use(signerIdentity(createSignerFromKeypair(umi, signer)));

  const privateKeyNew = process.env.NEW_UA_SECRET_KEY as string;
  const umiNew = createUmi(process.env.RPC as string, "confirmed").use(mplCore());
  const signerNew = umi.eddsa.createKeypairFromSecretKey(bs58.decode(privateKeyNew));
  umiNew.use(signerIdentity(createSignerFromKeypair(umi, signerNew)));

  const collectionKey = publicKey("DmL46V46U5VM4UgrJbVQvWhVyD1zjZGGVRWeMv46eWt9");
  const assets = await fetchAllDigitalAssetByUpdateAuthority(umiNew, signer.publicKey);
  const filteredAssets = assets.filter(
    (el) =>
      el.metadata.collection.__option === "Some" &&
      el.metadata.collection.value.key === collectionKey &&
      el.publicKey !== collectionKey
  );
  console.log(`Total assets: ${filteredAssets.length}`);

  for (let i = 0; i < filteredAssets.length; i++) {
    const asset = await fetchDigitalAsset(umi, publicKey(filteredAssets[i]));
    const itemMint = filteredAssets[i].publicKey;
    if (
      asset.mint.mintAuthority.__option === "Some" &&
      asset.mint.freezeAuthority.__option === "Some" &&
      asset.mint.mintAuthority.value.toString() === signerNew.publicKey.toString() &&
      asset.mint.freezeAuthority.value.toString() === signerNew.publicKey.toString()
    ) {
      console.log(`#${i} is already updated`);
      return;
    }
    console.log(`Handling i: ${i}, mint: ${itemMint}`);

    let builder = await setAuthority(umi, {
      authorityType: AuthorityType.MintTokens,
      newAuthority: umiNew.identity.publicKey,
      owned: publicKey(itemMint),
      owner: umi.identity.publicKey,
    }).add(
      setAuthority(umi, {
        authorityType: AuthorityType.FreezeAccount,
        newAuthority: umiNew.identity.publicKey,
        owned: publicKey(itemMint),
        owner: umi.identity.publicKey,
      })
    );
    builder = await builder.setLatestBlockhash(umi, { commitment: "confirmed" });
    const tx = await builder.sendAndConfirm(umi);

    if (tx.result.value.err) throw new Error(tx.result.value.err.toString());

    console.log(`Success #${i}`, tx);
  }
}
migrateSFTsAuthoritites().catch((err) => console.error(err));
