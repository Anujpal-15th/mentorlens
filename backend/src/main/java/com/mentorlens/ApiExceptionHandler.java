package com.mentorlens;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    record ApiError(String error) {}

    private static ResponseEntity<ApiError> of(HttpStatusCode s, String msg) {
        return ResponseEntity.status(s).body(new ApiError(msg));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalid(MethodArgumentNotValidException e) {
        var f = e.getBindingResult().getFieldError();
        return of(HttpStatus.BAD_REQUEST, f == null ? "Invalid input" : f.getField() + " " + f.getDefaultMessage());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException e) {
        return of(HttpStatus.BAD_REQUEST, "Request body is missing or malformed");
    }

    // a malformed id can never match a submission
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiError> badId(MethodArgumentTypeMismatchException e) {
        return of(HttpStatus.NOT_FOUND, "Not found");
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiError> status(ResponseStatusException e) {
        var code = e.getStatusCode();
        String msg = e.getReason() != null ? e.getReason()
            : code instanceof HttpStatus h ? h.getReasonPhrase() : "Request could not be processed";
        return ResponseEntity.status(code).headers(e.getHeaders()).body(new ApiError(msg));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ApiError> mediaType(HttpMediaTypeNotSupportedException e) {
        return of(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Content-Type must be application/json");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> method(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).headers(e.getHeaders())
            .body(new ApiError("Method not allowed"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> other(Exception e) {
        // Spring's own client errors, such as 404 for an unknown path, keep their status
        if (e instanceof ErrorResponse r && r.getStatusCode().is4xxClientError()) {
            return of(r.getStatusCode(), "Request could not be processed");
        }
        log.error("Request failed", e);
        return of(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again later.");
    }
}
