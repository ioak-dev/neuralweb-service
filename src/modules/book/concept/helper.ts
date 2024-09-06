const axios = require("axios");
import { cloneDeep, intersection } from "lodash";
const ONEAUTH_API = process.env.ONEAUTH_API || "http://localhost:4010/api";
import { bookConceptCollection, bookConceptSchema } from "./model";
import * as BookHelper from "../helper";
import { nextval } from "../../sequence/service";
import * as Gptutils from "../../../lib/gptutils";
import { getBookConceptsPrompt } from "./prompt";
const { getCollection } = require("../../../lib/dbutils");

const AI_API = process.env.AI_API || "http://localhost:5003/api";

export const generateConcepts = async (space: string, bookref: string) => {
  const book = await BookHelper.getBookByReference(space, bookref);
  console.log(book?.isbn);
  if (!book || !book.isManaged) {
    return null;
  }

  const gptResponseText = await Gptutils.predict(
    getBookConceptsPrompt(book.title, book.primaryAuthor)
  );
  console.log(gptResponseText);
  const gptResponse = JSON.parse(gptResponseText);
  console.log(gptResponse);

  if (!gptResponse) {
    return null;
  }

  const model = getCollection(space, bookConceptCollection, bookConceptSchema);
  const _payload: any[] = [];
  for (let i = 0; i < gptResponse.length; i++) {
    _payload.push({
      updateOne: {
        filter: {
          // _id: item._id,
          bookref,
          name: gptResponse[i].title,
        },
        update: {
          name: gptResponse[i].title,
          description: gptResponse[i].description,
          reference: await nextval("conceptId", bookref, space),
        },
        upsert: true,
      },
    });
  }
  return await model.bulkWrite(_payload);
};

export const createBookConcept = async (
  space: string,
  { bookConcept, meta }: any,
  userId?: string
) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);
  let response = null;
  response = await model.create({
    ...bookConcept,
    // reference: await nextval("bookConceptId", undefined, space),
  });
  console.log(response.reference);
  return response;
};

export const updateBookConcept = async (
  space: string,
  data: any,
  userId?: string
) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);
  let response = null;
  if (data._id) {
    response = await model.findByIdAndUpdate(data._id, data, {
      new: true,
      upsert: true,
    });
  } else {
    response = await model.create({
      ...data,
      // reference: await nextval("bookConceptId", undefined, space),
    });
  }

  const bookConceptResponse = await model.find({
    reference: response.reference,
  });
  let bookConcept = null;
  if (bookConceptResponse.length > 0) {
    bookConcept = bookConceptResponse[0];
  }

  return {
    bookConcept,
  };
};

export const getBookConcept = async (space: string) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);

  const res = await model.find();
  return res;
};

export const getBookConceptsByBookReference = async (
  space: string,
  bookref: string
) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);

  return await model.find({ bookref });
};

export const getBookConceptByBookReference = async (
  space: string,
  bookref: string,
  conceptref: string
) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);

  const response = await model.find({ bookref, reference: conceptref });
  if (response.length > 0) {
    return response[0];
  }
  return null;
};

export const getBookConceptById = async (space: string, _id: string) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);

  const res = await model.find({ _id });
  if (res.length > 0) {
    return res[0];
  }
};

export const deleteBookConcept = async (space: string, _id: string) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);

  await model.deleteMany({ _id });
  return { bookConcept: _id };
};

export const deleteBookConceptByReference = async (
  space: string,
  reference: string
) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);

  await model.deleteMany({ reference });
  return { bookConcept: reference };
};

export const addConcepts = async (
  space: string,
  bookref: string,
  conceptTitles: string[]
) => {
  const model = getCollection(space, bookConceptCollection, bookConceptSchema);
  const _payload: any[] = [];
  for (let i = 0; i < conceptTitles.length; i++) {
    _payload.push({
      updateOne: {
        filter: {
          // _id: item._id,
          bookref,
          name: conceptTitles[i],
        },
        update: {
          name: conceptTitles[i],
          reference: await nextval("conceptId", bookref, space),
        },
        upsert: true,
      },
    });
  }
  return await model.bulkWrite(_payload);
};
