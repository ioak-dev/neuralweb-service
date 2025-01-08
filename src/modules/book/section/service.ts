import { finishGenerating, startGenerating } from "../log/helper";
import * as Helper from "./helper";
import * as SectiondetailHelper from "../sectiondetail/helper";

export const generateSections = async (req: any, res: any) => {
  const userId = req.user.user_id;

  await startGenerating(req.params.space, req.params.bookref);

  res.status(202).send({
    message:
      "Section generation started. You will be notified upon completion.",
  });

  await Helper.generateSections(req.params.space, req.params.bookref);

  await finishGenerating(req.params.space, req.params.bookref);

  // await SectiondetailHelper.generateAllSectionSummaries(
  //   req.params.space,
  //   req.params.bookref
  // );

  // if (!response) {
  //   res.status(404);
  //   res.send({
  //     errorMessage: "ISBN not found",
  //   });
  //   res.end();
  // } else {
  //   res.status(200);
  //   res.send(response);
  //   res.end();
  // }
};

export const createBookSection = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const bookSection: any = await Helper.createBookSection(
    req.params.space,
    req.params.bookref,
    req.body,
    userId
  );
  res.status(200);
  res.send(bookSection);
  res.end();
};

export const updateBookSection = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const bookSection: any = await Helper.updateBookSection(
    req.params.space,
    req.params.bookref,
    req.params.sectionref,
    req.body,
    userId
  );
  res.status(200);
  res.send(bookSection);
  res.end();
};

export const getBookSection = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const bookSectionList: any = await Helper.getBookSection(req.params.space);
  res.status(200);
  res.send(bookSectionList);
  res.end();
};

export const getBookSectionById = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const bookSection: any = await Helper.getBookSectionById(
    req.params.space,
    req.params.id
  );
  res.status(200);
  res.send(bookSection);
  res.end();
};

export const getBookSectionsByBookReference = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const bookSection: any = await Helper.getBookSectionsByBookReference(
    req.params.space,
    req.params.bookref
  );
  res.status(200);
  res.send(bookSection);
  res.end();
};

export const getBookSectionByBookReference = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const bookSection: any = await Helper.getBookSectionByBookReference(
    req.params.space,
    req.params.bookref,
    req.params.sectionref
  );
  res.status(200);
  res.send(bookSection);
  res.end();
};

export const deleteBookSection = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const outcome: any = await Helper.deleteBookSection(
    req.params.space,
    req.params.id
  );
  res.status(200);
  res.send(outcome);
  res.end();
};

export const deleteBookSectionByReference = async (req: any, res: any) => {
  const userId = req.user.user_id;
  const outcome: any = await Helper.deleteBookSectionByReference(
    req.params.space,
    req.params.reference
  );
  res.status(200);
  res.send(outcome);
  res.end();
};
